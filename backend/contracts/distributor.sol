// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

//minimal view of CropTracker used by the distributor
interface IDistributorTracker {
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

    function fragmentFor(
        address caller,
        uint256 parentId,
        uint256[] memory sizes,
        address[] memory recipients,
        bool[] memory isFinal
    ) external returns (uint256[] memory);

    function getFragment(uint256 id) external view returns (Fragment memory);
}

//what the distributor needs from a Retailer contract
interface IRetailerStock {
    function owner() external view returns (address);

    function receive_stock(
        uint256 fragmentId,
        uint256 batchId,
        uint256 quantity,
        address distributor,
        uint256 price
    ) external;
}

/// @title distributor
/// @notice Second tier: a distributor offers part of the stock he holds to a
///         Retailer contract. Nothing moves until the Retailer's owner accepts
///         (or switched on auto_accept for this distributor).
///         How the distributor RECEIVED the stock (farmer offer + his accept)
///         lives in Farmer.sol; what he holds is read from CropTracker.
/// @dev This contract must be a registrar in CropTracker (it calls
///      `fragmentFor`). It always acts for the wallet that made the offer and
///      the tracker checks that wallet owns the fragment, so nobody can sell
///      stock that is not theirs.
contract distributor {
    IDistributorTracker public immutable tracker;

    enum OfferStatus {
        Pending,
        Accepted,
        Rejected,
        Cancelled
    }

    struct Offer {
        uint id;
        address sender; // distributor wallet making the offer
        address retailer; // Retailer contract that would receive the stock
        uint parent_fragment_id; // fragment the stock is carved from
        uint batch_id; // farm batch (tracker identification)
        uint quantity; // kg
        uint price; // per unit
        OfferStatus status;
        uint fragment_id; // set when accepted
        uint created_at;
    }

    mapping(uint => Offer) public offers;
    uint public offerCount;

    // Retailer contract => distributor wallet => "accept his offers without asking"
    mapping(address => mapping(address => bool)) public auto_accept;

    // fragment id created by an accepted offer => price per unit the distributor charged
    mapping(uint => uint) public fragment_sale_price;

    event batchoffered(
        uint indexed offer_id,
        uint parent_fragment_id,
        address indexed sender,
        address indexed retailer,
        uint quantity,
        uint price
    );
    event batchforwarded(
        uint indexed batch_id,
        uint indexed parent_fragment_id,
        uint indexed fragment_id,
        address retailer,
        uint quantity,
        uint price
    );
    event offerrejected(uint indexed offer_id);
    event offercancelled(uint indexed offer_id);

    constructor(address _tracker) {
        require(_tracker != address(0), "Zero tracker");
        require(_tracker.code.length > 0, "Tracker not a contract");
        tracker = IDistributorTracker(_tracker);
    }

    /// @notice Offer `quantity` kg of a fragment you hold to a Retailer contract.
    /// @param parent_fragment_id fragment the caller holds
    /// @param quantity kg to offer
    /// @param retailer_contract Retailer contract that would hold the stock
    /// @param price_perunit price per unit, recorded against the new fragment
    function offer_batch(
        uint parent_fragment_id,
        uint quantity,
        address retailer_contract,
        uint price_perunit
    ) public returns (uint offer_id) {
        require(quantity > 0, "Quantity must be > 0");
        require(retailer_contract != address(0), "Zero retailer");
        require(retailer_contract.code.length > 0, "Retailer must be a contract");

        // reverts "Fragment not found" for an unknown id
        IDistributorTracker.Fragment memory f = tracker.getFragment(parent_fragment_id);
        require(f.owner == msg.sender, "Not fragment owner");
        require(!f.df, "DF set: cannot fragment");
        require(quantity <= f.size - f.allocated, "Exceeds fragment size");

        offer_id = ++offerCount;
        offers[offer_id] = Offer({
            id: offer_id,
            sender: msg.sender,
            retailer: retailer_contract,
            parent_fragment_id: parent_fragment_id,
            batch_id: f.identification,
            quantity: quantity,
            price: price_perunit,
            status: OfferStatus.Pending,
            fragment_id: 0,
            created_at: block.timestamp
        });
        emit batchoffered(
            offer_id,
            parent_fragment_id,
            msg.sender,
            retailer_contract,
            quantity,
            price_perunit
        );

        if (auto_accept[retailer_contract][msg.sender]) {
            _hand_over(offer_id);
        }
    }

    /// Retailer owner says yes: the kg become the Retailer's and are logged in
    /// its inventory in the same transaction.
    function accept_offer(uint offer_id) public {
        Offer storage o = _pending_offer(offer_id);
        require(msg.sender == IRetailerStock(o.retailer).owner(), "Not the retailer owner");
        _hand_over(offer_id);
    }

    /// Retailer owner says no. Nothing changed anywhere, the distributor keeps his stock.
    function reject_offer(uint offer_id) public {
        Offer storage o = _pending_offer(offer_id);
        require(msg.sender == IRetailerStock(o.retailer).owner(), "Not the retailer owner");
        o.status = OfferStatus.Rejected;
        emit offerrejected(offer_id);
    }

    /// Distributor withdraws an offer the retailer has not answered yet.
    function cancel_offer(uint offer_id) public {
        Offer storage o = _pending_offer(offer_id);
        require(msg.sender == o.sender, "Not the sender of this offer");
        o.status = OfferStatus.Cancelled;
        emit offercancelled(offer_id);
    }

    /// Retailer owner opts in / out of skipping the approval for one distributor he trusts.
    function set_auto_accept(
        address retailer_contract,
        address sender,
        bool allowed
    ) public {
        require(
            msg.sender == IRetailerStock(retailer_contract).owner(),
            "Not the retailer owner"
        );
        auto_accept[retailer_contract][sender] = allowed;
    }

    /// All offers (every status) a distributor wallet has made.
    function get_offers_by_sender(address sender) public view returns (Offer[] memory) {
        return _collect(sender, true);
    }

    /// All offers (every status) made to a Retailer contract.
    function get_offers_for_retailer(
        address retailer_contract
    ) public view returns (Offer[] memory) {
        return _collect(retailer_contract, false);
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    /// carve the offered kg out of the parent and give them to the Retailer
    function _hand_over(uint offer_id) private {
        Offer storage o = offers[offer_id];

        // effects first
        o.status = OfferStatus.Accepted;

        uint[] memory sizes = new uint[](1);
        address[] memory recipients = new address[](1);
        bool[] memory finals = new bool[](1); // false: retailer finalizes later
        sizes[0] = o.quantity;
        recipients[0] = o.retailer;

        // tracker enforces: sender still owns the parent, not final, enough left
        uint fragment_id = tracker.fragmentFor(
            o.sender,
            o.parent_fragment_id,
            sizes,
            recipients,
            finals
        )[0];
        o.fragment_id = fragment_id;
        fragment_sale_price[fragment_id] = o.price;

        emit batchforwarded(
            o.batch_id,
            o.parent_fragment_id,
            fragment_id,
            o.retailer,
            o.quantity,
            o.price
        );

        // log it in the Retailer's inventory (only this contract is allowed to)
        IRetailerStock(o.retailer).receive_stock(
            fragment_id,
            o.batch_id,
            o.quantity,
            o.sender,
            o.price
        );
    }

    function _pending_offer(uint offer_id) private view returns (Offer storage o) {
        o = offers[offer_id];
        require(o.id != 0, "Offer not found");
        require(o.status == OfferStatus.Pending, "Offer not pending");
    }

    function _collect(address who, bool bySender) private view returns (Offer[] memory result) {
        uint n;
        for (uint i = 1; i <= offerCount; i++) {
            if (_matches(i, who, bySender)) n++;
        }
        result = new Offer[](n);
        uint k;
        for (uint i = 1; i <= offerCount; i++) {
            if (_matches(i, who, bySender)) result[k++] = offers[i];
        }
    }

    function _matches(uint i, address who, bool bySender) private view returns (bool) {
        return bySender ? offers[i].sender == who : offers[i].retailer == who;
    }
}
