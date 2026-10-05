// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ITrackerView {
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

    struct Custody {
        address holder;
        uint256 timestamp;
    }

    function getFragment(uint256 id) external view returns (Fragment memory);

    function getLineage(uint256 id) external view returns (Fragment[] memory);

    function getCustodyHistory(
        uint256 id
    ) external view returns (Custody[] memory);

    function verifyFragment(
        uint256 id,
        uint256 identification,
        uint256 offset,
        uint256 size
    ) external view returns (bool);
}

interface IFarmerView {
    // same field layout as `batch` in Farmer.sol (ABI-compatible)
    struct FarmBatch {
        uint256 batch_id;
        string crop_name;
        uint256 quantity;
        uint256 expected_p_kg_price;
        string farm_city_location;
        string harvest_date;
        string typeof_crop;
    }

    function find_batch(
        address farmer,
        uint256 batchId
    ) external view returns (bool found, FarmBatch memory b);

    function fragment_sale_price(uint256 fragmentId) external view returns (uint256);
}

interface IDistributorView {
    function fragment_sale_price(uint256 fragmentId) external view returns (uint256);
}

/// @dev only used for its selector: Retailer.get_item(uint256)
interface IRetailerView {
    function get_item(uint256 fragmentId) external view returns (uint256);
}

/// @title SupplyChainViewer
/// @notice Read-only. One call, `getProductDetails(fragmentId)`, returns where a
///         product (a farm batch, an in-between lot or a final retail pack)
///         came from and where it is now. Holds no state and no permissions:
///         it cannot change anything in CropTracker, Farmer or Retailer.
contract SupplyChainViewer {
    enum RetailStatus {
        InTransit,
        OnShelf,
        Finalized,
        Damaged
    }

    /// @dev farm-side data, from the Farmer contract (found=false if the farmer
    ///      record is missing, e.g. a batch registered straight in the tracker)
    struct Origin {
        bool found;
        address farmer;
        string cropName;
        string cropType;
        string farmLocation;
        string harvestDate;
        uint256 expectedPricePerKg;
    }

    /// @dev only filled when the current holder is a Retailer contract that
    ///      lists this fragment in its inventory
    struct RetailInfo {
        bool atRetailer;
        address retailer;
        address distributor;
        RetailStatus status;
        uint256 price;
        uint256 receivedTimestamp;
    }

    struct ProductDetails {
        ITrackerView.Fragment fragment; // the product itself (size, offset, MF/DF, holder)
        uint256 unallocated; // part not yet handed out to children
        ITrackerView.Fragment[] lineage; // [fragment, parent, ..., root batch]
        // price per unit at which lineage[i] was handed over (farmer or
        // distributor price). 0 for the root batch or when no price is recorded.
        uint256[] hopPrices;
        ITrackerView.Custody[] custody; // every holder of this fragment, oldest first
        Origin origin;
        RetailInfo retail;
    }

    ITrackerView public immutable tracker;
    IFarmerView public immutable farmerContract;
    IDistributorView public immutable distributorContract;

    // enough for a plain mapping read, stops a hostile holder contract from
    // burning the caller's gas
    uint256 private constant RETAIL_CALL_GAS = 200_000;

    constructor(
        address _tracker,
        address _farmerContract,
        address _distributorContract
    ) {
        require(_tracker.code.length > 0, "Tracker not a contract");
        require(_farmerContract.code.length > 0, "Farmer not a contract");
        require(_distributorContract.code.length > 0, "Distributor not a contract");
        tracker = ITrackerView(_tracker);
        farmerContract = IFarmerView(_farmerContract);
        distributorContract = IDistributorView(_distributorContract);
    }

    /// @notice Everything known about one fragment, in a single call.
    ///         Reverts with "Fragment not found" for an unknown id.
    function getProductDetails(
        uint256 fragmentId
    ) external view returns (ProductDetails memory d) {
        d.fragment = tracker.getFragment(fragmentId);
        d.unallocated = d.fragment.size - d.fragment.allocated;
        d.lineage = tracker.getLineage(fragmentId);
        d.custody = tracker.getCustodyHistory(fragmentId);
        d.hopPrices = new uint256[](d.lineage.length);
        for (uint256 i = 0; i < d.lineage.length; i++) {
            d.hopPrices[i] = _hopPrice(d.lineage[i].id, d.lineage[i].parentId);
        }

        ITrackerView.Fragment memory root = d.lineage[d.lineage.length - 1];
        d.origin = _origin(root.farmer, root.identification);
        d.retail = _retail(d.fragment.owner, fragmentId);
    }

    /// @notice Anti-counterfeit check for a printed label (id, batch, offset, size).
    function verifyLabel(
        uint256 fragmentId,
        uint256 batchId,
        uint256 offset,
        uint256 size
    ) external view returns (bool) {
        return tracker.verifyFragment(fragmentId, batchId, offset, size);
    }

    // ---------------------------------------------------------------------

    /// @dev price recorded when `id` was carved out of its parent: by the
    ///      distributor contract (retailer hop) or by the Farmer contract
    ///      (distributor hop). Fragment ids are unique, so at most one is set.
    function _hopPrice(
        uint256 id,
        uint256 parentId
    ) private view returns (uint256) {
        if (parentId == 0) return 0; // root batch was never sold
        uint256 p = distributorContract.fragment_sale_price(id);
        if (p != 0) return p;
        return farmerContract.fragment_sale_price(id);
    }

    function _origin(
        address farmer,
        uint256 batchId
    ) private view returns (Origin memory o) {
        o.farmer = farmer;
        try farmerContract.find_batch(farmer, batchId) returns (
            bool found,
            IFarmerView.FarmBatch memory b
        ) {
            if (found) {
                o.found = true;
                o.cropName = b.crop_name;
                o.cropType = b.typeof_crop;
                o.farmLocation = b.farm_city_location;
                o.harvestDate = b.harvest_date;
                o.expectedPricePerKg = b.expected_p_kg_price;
            }
        } catch {}
    }

    /// @dev Low-level, bounded call: the holder is an arbitrary address. It may
    ///      be a wallet, some other contract, or a malicious one, so a bad
    ///      answer must never make the whole view revert.
    function _retail(
        address holder,
        uint256 fragmentId
    ) private view returns (RetailInfo memory r) {
        if (holder.code.length == 0) return r;

        (bool ok, bytes memory data) = holder.staticcall{gas: RETAIL_CALL_GAS}(
            abi.encodeWithSelector(IRetailerView.get_item.selector, fragmentId)
        );
        // Retailer.Item = 7 static words
        if (!ok || data.length != 224) return r;

        (
            uint256 fid,
            ,
            ,
            uint256 distributor,
            uint256 price,
            uint256 status,
            uint256 ts
        ) = abi.decode(
                data,
                (uint256, uint256, uint256, uint256, uint256, uint256, uint256)
            );
        if (fid != fragmentId || status > uint256(RetailStatus.Damaged)) return r;

        r.atRetailer = true;
        r.retailer = holder;
        r.distributor = address(uint160(distributor));
        r.status = RetailStatus(status);
        r.price = price;
        r.receivedTimestamp = ts;
    }
}
