// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Subset of CropTracker used by the Retailer.
/// @dev `getFragment` is added on top of markFinal / transferFragment so the
///      Retailer can verify every stock claim against the tracker instead of
///      trusting the values its operator types in.
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

    function markFinal(uint256 id) external;

    function transferFragment(uint256 id, address to) external;

    function getFragment(uint256 id) external view returns (Fragment memory);
}

/// @title Retailer
/// @notice Third tier of the supply chain (Farmer -> Distributor -> Retailer ->
///         Consumer). Holds stock a distributor handed over and turns it into a
///         final retail unit (DF flag) in CropTracker.
///
/// @dev Stock arrives only with the owner's permission:
///        distributor.offer_batch(...)   distributor offers
///        distributor.accept_offer(id)   THIS contract's owner accepts
///      On accept the distributor contract carves the fragment to this contract
///      and calls `receive_stock`, which logs it as OnShelf. Nobody else can
///      call `receive_stock`, and every value is re-checked against CropTracker.
contract Retailer {
    enum StockStatus {
        InTransit,
        OnShelf,
        Finalized,
        Damaged
    }

    struct Item {
        uint256 fragmentId;
        uint256 batchId;
        uint256 quantity;
        address distributor;
        uint256 price;
        StockStatus status;
        uint256 receivedTimestamp;
    }

    address public owner;
    address public cropTrackerAddress;
    // the only contract allowed to log incoming stock (after the owner accepted)
    address public distributorAddress;

    mapping(uint256 => Item) public inventory;
    uint256[] public inventoryList;

    event StockReceived(
        uint256 indexed fragmentId,
        address indexed distributor,
        uint256 quantity,
        uint256 price
    );
    event StockPriceChanged(uint256 indexed fragmentId, uint256 price);
    event StockFinalized(uint256 indexed fragmentId, uint256 timestamp);
    event StockReportedDamaged(uint256 indexed fragmentId, string reason);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _cropTrackerAddress, address _distributorAddress) {
        require(_cropTrackerAddress != address(0), "Zero tracker");
        require(_cropTrackerAddress.code.length > 0, "Tracker not a contract");
        require(_distributorAddress.code.length > 0, "Distributor not a contract");
        owner = msg.sender;
        cropTrackerAddress = _cropTrackerAddress;
        distributorAddress = _distributorAddress;
    }

    // ---------------------------------------------------------------------
    // Write functions
    // ---------------------------------------------------------------------

    /// @notice Log accepted stock. Called by the distributor contract inside
    ///         `accept_offer`, never by a person. Every claim is checked
    ///         against CropTracker.
    /// @param _fragmentId  tracker fragment id
    /// @param _batchId     farm batch id (tracker `identification`)
    /// @param _quantity    whole size of the fragment (kg)
    /// @param _distributor the distributor wallet that supplied it
    /// @param _price       price per unit the distributor charged
    function receive_stock(
        uint256 _fragmentId,
        uint256 _batchId,
        uint256 _quantity,
        address _distributor,
        uint256 _price
    ) external {
        require(msg.sender == distributorAddress, "Only distributor contract");
        require(_quantity > 0, "Quantity must be > 0");
        require(_distributor != address(0), "Zero distributor");
        require(
            inventory[_fragmentId].receivedTimestamp == 0,
            "Fragment already received"
        );

        ICropTracker.Fragment memory f = ICropTracker(cropTrackerAddress)
            .getFragment(_fragmentId); // reverts if the fragment does not exist
        require(f.owner == address(this), "Fragment not held by retailer");
        require(f.identification == _batchId, "Batch id mismatch");
        require(f.size == _quantity, "Quantity mismatch");
        require(f.allocated == 0, "Fragment already split");

        inventory[_fragmentId] = Item({
            fragmentId: _fragmentId,
            batchId: _batchId,
            quantity: _quantity,
            distributor: _distributor,
            price: _price,
            status: StockStatus.OnShelf,
            receivedTimestamp: block.timestamp
        });
        inventoryList.push(_fragmentId);

        emit StockReceived(_fragmentId, _distributor, _quantity, _price);
    }

    /// @notice Set the price per unit you sell shelf stock for. Starts as the
    ///         price the distributor charged you.
    function set_price(uint256 _fragmentId, uint256 _price) external onlyOwner {
        Item storage item = inventory[_fragmentId];
        require(item.receivedTimestamp != 0, "Item not found");
        require(item.status == StockStatus.OnShelf, "Item not on shelf");
        item.price = _price;
        emit StockPriceChanged(_fragmentId, _price);
    }

    /// @notice Mark shelf stock as a final retail unit (DF) in CropTracker.
    ///         After this the fragment can never be split again.
    /// @dev If the distributor already shipped the fragment as final (DF set),
    ///      the tracker would revert with "Already final"; in that case only
    ///      the local status is updated.
    function mark_as_final(uint256 _fragmentId) external onlyOwner {
        Item storage item = inventory[_fragmentId];
        require(item.receivedTimestamp != 0, "Item not found");
        require(item.status == StockStatus.OnShelf, "Item not on shelf");

        // effects before interaction
        item.status = StockStatus.Finalized;

        ICropTracker tracker = ICropTracker(cropTrackerAddress);
        if (!tracker.getFragment(_fragmentId).df) {
            tracker.markFinal(_fragmentId);
        }

        emit StockFinalized(_fragmentId, block.timestamp);
    }

    /// @notice Flag shelf stock as damaged. The tracker is untouched: the
    ///         fragment history stays intact for later audit.
    function report_damaged(
        uint256 _fragmentId,
        string calldata _reason
    ) external onlyOwner {
        Item storage item = inventory[_fragmentId];
        require(item.receivedTimestamp != 0, "Item not found");
        require(item.status == StockStatus.OnShelf, "Item not on shelf");
        require(bytes(_reason).length > 0, "Reason required");

        item.status = StockStatus.Damaged;
        emit StockReportedDamaged(_fragmentId, _reason);
    }

    // ---------------------------------------------------------------------
    // Read functions
    // ---------------------------------------------------------------------

    function get_all_inventory() external view returns (Item[] memory items) {
        uint256 n = inventoryList.length;
        items = new Item[](n);
        for (uint256 i = 0; i < n; i++) {
            items[i] = inventory[inventoryList[i]];
        }
    }

    function get_item(uint256 _fragmentId) external view returns (Item memory) {
        Item memory item = inventory[_fragmentId];
        require(item.receivedTimestamp != 0, "Item not found");
        return item;
    }
}
