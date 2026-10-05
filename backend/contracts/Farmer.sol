// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Farm-side details of one harvest. WHO holds WHICH kg lives in CropTracker.
struct batch {
    uint batch_id;
    string crop_name;
    uint quantity; // kg the farmer still holds (not yet handed to a distributor)
    uint expected_p_kg_price;
    string farm_city_location;
    string harvest_date;
    string typeof_crop;
}

contract Farmer {
    // ------------------------------------------------------------------
    // Profile (used by the app, not by the supply-chain logic)
    // ------------------------------------------------------------------
    enum Role {
        Farmer,
        Distributor,
        Retailer,
        Consumer
    }

    mapping(address => Role) public user_role;
    mapping(address => bool) public is_role_assigned;
    mapping(address => string) public farmer_profile_name;

    function set_user_role(Role _role) public {
        require(!is_role_assigned[msg.sender], "Role already assigned");
        user_role[msg.sender] = _role;
        is_role_assigned[msg.sender] = true;
    }

    function get_user_role() public view returns (Role) {
        return user_role[msg.sender];
    }

    function set_farmer_profile_name(string memory _name) public {
        farmer_profile_name[msg.sender] = _name;
    }

    function get_farmer_profile_name() public view returns (string memory) {
        return farmer_profile_name[msg.sender];
    }

    // ------------------------------------------------------------------
    // Batches
    // ------------------------------------------------------------------
    ICropTracker public tracker;
    // batch_id (= tracker identification) => root fragment id in the tracker
    mapping(uint => uint) public batch_root_fragment;
    // farmer => his batches
    mapping(address => batch[]) public Farmer_batches;

    event batchregistered(uint batch_id, string crop_name, address farmer);

    constructor(address _tracker) {
        require(_tracker != address(0), "Zero tracker");
        tracker = ICropTracker(_tracker);
    }

    /// The batch id is NOT chosen by the caller: CropTracker generates it and
    /// registers the harvest there as the root of the fragment tree.
    function create_batch(
        string memory _crop_name,
        uint _quantity, // kg
        uint _expected_p_kg_price,
        string memory _farm_city_location,
        string memory _harvest_date,
        string memory _typeof_crop
    ) public returns (uint batch_id) {
        require(_quantity > 0, "Quantity must be > 0");

        uint root_id;
        (batch_id, root_id) = tracker.registerBatch(msg.sender, _quantity);
        batch_root_fragment[batch_id] = root_id;

        Farmer_batches[msg.sender].push(
            batch({
                batch_id: batch_id,
                crop_name: _crop_name,
                quantity: _quantity,
                expected_p_kg_price: _expected_p_kg_price,
                farm_city_location: _farm_city_location,
                harvest_date: _harvest_date,
                typeof_crop: _typeof_crop
            })
        );
        emit batchregistered(batch_id, _crop_name, msg.sender);
    }

    /// Details of one of the CALLER's batches.
    function get_batch_details(uint _batch_id) public view returns (batch memory) {
        (bool found, uint i) = _find(msg.sender, _batch_id);
        require(found, "Batch not found");
        return Farmer_batches[msg.sender][i];
    }

    /// Details of any farmer's batch. Never reverts (used by SupplyChainViewer).
    function find_batch(
        address _farmer,
        uint _batch_id
    ) public view returns (bool found, batch memory b) {
        uint i;
        (found, i) = _find(_farmer, _batch_id);
        if (found) b = Farmer_batches[_farmer][i];
    }

    function get_all_batches() public view returns (batch[] memory) {
        return Farmer_batches[msg.sender];
    }

    /// Only a batch nothing was ever handed out of can be deleted.
    function delete_recent_batch(uint id) public {
        (bool found, uint i) = _find(msg.sender, id);
        require(found, "Batch ID not found for deletion");
        require(
            tracker.getFragment(batch_root_fragment[id]).allocated == 0,
            "Batch already shipped"
        );

        // swap-and-pop
        batch[] storage list = Farmer_batches[msg.sender];
        if (i != list.length - 1) {
            list[i] = list[list.length - 1];
        }
        list.pop();
        delete batch_root_fragment[id];
    }

    // ------------------------------------------------------------------
    // Offers: farmer -> distributor. Nothing moves until the distributor
    // accepts (or has switched on auto_accept for this farmer).
    // ------------------------------------------------------------------
    enum OfferStatus {
        Pending,
        Accepted,
        Rejected,
        Cancelled
    }

    struct Offer {
        uint id;
        address farmer;
        address distributor;
        uint batch_id;
        uint quantity; // kg
        uint price; // per unit
        OfferStatus status;
        uint fragment_id; // set when accepted
        uint created_at;
    }

    mapping(uint => Offer) public offers;
    uint public offerCount;

    // distributor => farmer => "I accept this farmer's offers without asking"
    mapping(address => mapping(address => bool)) public auto_accept;

    // fragment id created by an accepted offer => price per unit the farmer charged
    mapping(uint => uint) public fragment_sale_price;

    event batchoffered(
        uint indexed offer_id,
        uint batch_id,
        address indexed farmer,
        address indexed distributor,
        uint quantity,
        uint price
    );
    event batchsent(
        uint batch_id,
        uint fragment_id,
        address distributor_address,
        uint quantity
    );
    event offerrejected(uint indexed offer_id);
    event offercancelled(uint indexed offer_id);

    /// Farmer offers `quantity` kg of a batch to a distributor wallet.
    function offer_batch(
        uint batchid,
        uint quantity,
        address distributor_address,
        uint price_perunit
    ) public returns (uint offer_id) {
        require(distributor_address != address(0), "Zero distributor");
        (bool found, uint i) = _find(msg.sender, batchid);
        require(found, "Batch not found");
        require(
            quantity > 0 && quantity <= Farmer_batches[msg.sender][i].quantity,
            "Invalid quantity"
        );

        offer_id = ++offerCount;
        offers[offer_id] = Offer({
            id: offer_id,
            farmer: msg.sender,
            distributor: distributor_address,
            batch_id: batchid,
            quantity: quantity,
            price: price_perunit,
            status: OfferStatus.Pending,
            fragment_id: 0,
            created_at: block.timestamp
        });
        emit batchoffered(
            offer_id,
            batchid,
            msg.sender,
            distributor_address,
            quantity,
            price_perunit
        );

        if (auto_accept[distributor_address][msg.sender]) {
            _hand_over(offer_id);
        }
    }

    /// Distributor says yes: the kg are carved out in the tracker and become his.
    function accept_offer(uint offer_id) public {
        Offer storage o = _pending_offer(offer_id);
        require(msg.sender == o.distributor, "Not the distributor of this offer");
        _hand_over(offer_id);
    }

    /// Distributor says no. Nothing changed anywhere, the farmer keeps his stock.
    function reject_offer(uint offer_id) public {
        Offer storage o = _pending_offer(offer_id);
        require(msg.sender == o.distributor, "Not the distributor of this offer");
        o.status = OfferStatus.Rejected;
        emit offerrejected(offer_id);
    }

    /// Farmer withdraws an offer the distributor has not answered yet.
    function cancel_offer(uint offer_id) public {
        Offer storage o = _pending_offer(offer_id);
        require(msg.sender == o.farmer, "Not the farmer of this offer");
        o.status = OfferStatus.Cancelled;
        emit offercancelled(offer_id);
    }

    /// Distributor opts in / out of skipping the approval for one farmer he trusts.
    function set_auto_accept(address farmer, bool allowed) public {
        auto_accept[msg.sender][farmer] = allowed;
    }

    /// All offers (every status) a farmer has made.
    function get_offers_by_farmer(address farmer) public view returns (Offer[] memory) {
        return _collect(farmer, true);
    }

    /// All offers (every status) made to a distributor wallet.
    function get_offers_for_distributor(
        address distributor_address
    ) public view returns (Offer[] memory) {
        return _collect(distributor_address, false);
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    /// carve the offered kg out of the batch root and give them to the distributor
    function _hand_over(uint offer_id) private {
        Offer storage o = offers[offer_id];

        (bool found, uint i) = _find(o.farmer, o.batch_id);
        require(found, "Batch not found"); // farmer deleted it meanwhile
        batch storage b = Farmer_batches[o.farmer][i];
        require(o.quantity <= b.quantity, "Not enough left");

        // effects first
        o.status = OfferStatus.Accepted;
        b.quantity -= o.quantity;

        uint[] memory sizes = new uint[](1);
        address[] memory recipients = new address[](1);
        bool[] memory finals = new bool[](1); // false: distributor may split again
        sizes[0] = o.quantity;
        recipients[0] = o.distributor;

        uint fragment_id = tracker.fragmentFor(
            o.farmer,
            batch_root_fragment[o.batch_id],
            sizes,
            recipients,
            finals
        )[0];
        o.fragment_id = fragment_id;
        fragment_sale_price[fragment_id] = o.price;

        emit batchsent(o.batch_id, fragment_id, o.distributor, o.quantity);
    }

    function _pending_offer(uint offer_id) private view returns (Offer storage o) {
        o = offers[offer_id];
        require(o.id != 0, "Offer not found");
        require(o.status == OfferStatus.Pending, "Offer not pending");
    }

    function _collect(address who, bool byFarmer) private view returns (Offer[] memory result) {
        uint n;
        for (uint i = 1; i <= offerCount; i++) {
            if (_matches(i, who, byFarmer)) n++;
        }
        result = new Offer[](n);
        uint k;
        for (uint i = 1; i <= offerCount; i++) {
            if (_matches(i, who, byFarmer)) result[k++] = offers[i];
        }
    }

    function _matches(uint i, address who, bool byFarmer) private view returns (bool) {
        return byFarmer ? offers[i].farmer == who : offers[i].distributor == who;
    }

    function _find(address farmer, uint id) private view returns (bool, uint) {
        batch[] storage list = Farmer_batches[farmer];
        for (uint i = 0; i < list.length; i++) {
            if (list[i].batch_id == id) return (true, i);
        }
        return (false, 0);
    }
}

//interface for the CropTracker (registers batches and records fragments)
interface ICropTracker {
    struct Fragment {
        uint256 id;
        uint256 identification;
        address farmer;
        uint256 parentId;
        uint256 offset;
        uint256 size;
        uint256 allocated;
        bool mf;
        bool df;
        address owner;
        uint256 createdAt;
    }

    function registerBatch(
        address farmer,
        uint256 totalSize
    ) external returns (uint256 identification, uint256 rootId);

    function fragmentFor(
        address caller,
        uint256 parentId,
        uint256[] memory sizes,
        address[] memory recipients,
        bool[] memory isFinal
    ) external returns (uint256[] memory);

    function getFragment(uint256 id) external view returns (Fragment memory);
}
