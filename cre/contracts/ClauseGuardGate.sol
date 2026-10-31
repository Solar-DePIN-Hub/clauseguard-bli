// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IClauseGuardRegistry {
    struct Attestation {
        bytes32 reportHash;
        uint8 score;
        uint8 highFindings;
        bool needsLawyer;
        string ruleset;
        uint64 timestamp;
    }
    function reviews(bytes32 docHash) external view returns (Attestation[] memory);
    function latest(bytes32 docHash) external view returns (Attestation memory);
}

/// @title ClauseGuardGate
/// @notice Refuses PPA signing and escrow release while ClauseGuard flags needsLawyer,
///         until an approved lawyer approves the exact reviewed version.
contract ClauseGuardGate {
    address public owner;
    IClauseGuardRegistry public immutable registry;

    mapping(address => bool) public isLawyer;
    mapping(bytes32 => bytes32) public lawyerApproval; // docHash => approved reportHash
    mapping(bytes32 => address) public approvedBy;

    struct Deal {
        address producer;
        address offtaker;
        uint256 escrow;
        bool producerSigned;
        bool offtakerSigned;
        bool released;
    }
    mapping(bytes32 => Deal) public deals;

    event LawyerSet(address indexed who, bool ok);
    event LawyerApproved(bytes32 indexed docHash, bytes32 indexed reportHash, address indexed lawyer);
    event DealOpened(bytes32 indexed docHash, address indexed producer, address indexed offtaker, uint256 escrow);
    event Signed(bytes32 indexed docHash, address indexed signer);
    event Released(bytes32 indexed docHash, address indexed producer, uint256 amount);
    event Refunded(bytes32 indexed docHash, address indexed offtaker, uint256 amount);

    error NotOwner();
    error NotLawyer();
    error NotParty();
    error NotReviewed(bytes32 docHash);
    error NeedsLawyer(bytes32 docHash);
    error StaleReport();
    error BadDeal();
    error AlreadyReleased();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address registry_) {
        if (registry_ == address(0)) revert BadDeal();
        owner = msg.sender;
        registry = IClauseGuardRegistry(registry_);
    }

    function setLawyer(address who, bool ok) external onlyOwner {
        isLawyer[who] = ok;
        emit LawyerSet(who, ok);
    }

    function approve(bytes32 docHash, bytes32 reportHash) external {
        if (!isLawyer[msg.sender]) revert NotLawyer();
        IClauseGuardRegistry.Attestation[] memory revs = registry.reviews(docHash);
        if (revs.length == 0) revert NotReviewed(docHash);
        IClauseGuardRegistry.Attestation memory last = registry.latest(docHash);
        if (last.reportHash != reportHash) revert StaleReport();
        lawyerApproval[docHash] = reportHash;
        approvedBy[docHash] = msg.sender;
        emit LawyerApproved(docHash, reportHash, msg.sender);
    }

    function status(bytes32 docHash) public view returns (bool reviewed, bool needsLawyer, bool cleared) {
        IClauseGuardRegistry.Attestation[] memory revs = registry.reviews(docHash);
        reviewed = revs.length > 0;
        if (!reviewed) {
            needsLawyer = false;
            cleared = false;
            return (reviewed, needsLawyer, cleared);
        }
        IClauseGuardRegistry.Attestation memory last = registry.latest(docHash);
        needsLawyer = last.needsLawyer;
        cleared = !needsLawyer || (lawyerApproval[docHash] == last.reportHash);
        return (reviewed, needsLawyer, cleared);
    }

    function openDeal(bytes32 docHash, address producer) external payable {
        Deal storage d = deals[docHash];
        if (d.producer != address(0)) revert BadDeal();
        if (producer == address(0) || producer == msg.sender) revert BadDeal();
        d.producer = producer;
        d.offtaker = msg.sender;
        d.escrow = msg.value;
        emit DealOpened(docHash, producer, msg.sender, msg.value);
    }

    function sign(bytes32 docHash) external {
        Deal storage d = deals[docHash];
        if (d.producer == address(0)) revert BadDeal();
        if (msg.sender != d.producer && msg.sender != d.offtaker) revert NotParty();
        (bool reviewed, , bool cleared) = status(docHash);
        if (!reviewed) revert NotReviewed(docHash);
        if (!cleared) revert NeedsLawyer(docHash);
        if (msg.sender == d.producer) {
            d.producerSigned = true;
        } else {
            d.offtakerSigned = true;
        }
        emit Signed(docHash, msg.sender);
    }

    function release(bytes32 docHash) external {
        Deal storage d = deals[docHash];
        if (d.producer == address(0)) revert BadDeal();
        if (msg.sender != d.offtaker) revert NotParty();
        if (d.released) revert AlreadyReleased();
        if (!(d.producerSigned && d.offtakerSigned)) revert BadDeal();
        (bool reviewed, , bool cleared) = status(docHash);
        if (!reviewed) revert NotReviewed(docHash);
        if (!cleared) revert NeedsLawyer(docHash);
        uint256 amount = d.escrow;
        d.released = true;
        d.escrow = 0;
        (bool ok, ) = d.producer.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Released(docHash, d.producer, amount);
    }

    function refund(bytes32 docHash) external {
        Deal storage d = deals[docHash];
        if (d.producer == address(0)) revert BadDeal();
        if (msg.sender != d.offtaker) revert NotParty();
        if (d.released) revert AlreadyReleased();
        if (d.producerSigned && d.offtakerSigned) revert BadDeal();
        uint256 amount = d.escrow;
        d.escrow = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Refunded(docHash, msg.sender, amount);
    }
}
