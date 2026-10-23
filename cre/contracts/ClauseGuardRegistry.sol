// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Minimal Chainlink CRE receiver interfaces (same signatures as smartcontractkit/cre-templates, MIT).
interface IERC165 { function supportsInterface(bytes4 interfaceId) external view returns (bool); }
interface IReceiver is IERC165 { function onReport(bytes calldata metadata, bytes calldata report) external; }

/// @title ClauseGuardRegistry
/// @notice Public registry of contract reviews written by the ClauseGuard CRE workflow.
///         Stores only hashes and the score, never contract text.
contract ClauseGuardRegistry is IReceiver {
    struct Attestation { bytes32 reportHash; uint8 score; uint8 highFindings; bool needsLawyer; string ruleset; uint64 timestamp; }

    address public immutable forwarder; // Chainlink KeystoneForwarder (or simulation forwarder) for this chain
    mapping(bytes32 => Attestation[]) private _byDoc; // docHash => history of reviews

    event Attested(bytes32 indexed docHash, bytes32 indexed reportHash, uint8 score, uint8 highFindings, bool needsLawyer, string ruleset);
    error InvalidSender(address sender);

    constructor(address _forwarder) { require(_forwarder != address(0), "forwarder required"); forwarder = _forwarder; }

    function onReport(bytes calldata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert InvalidSender(msg.sender);
        (bytes32 docHash, bytes32 reportHash, uint8 score, uint8 high, bool flag, string memory ruleset) =
            abi.decode(report, (bytes32, bytes32, uint8, uint8, bool, string));
        _byDoc[docHash].push(Attestation(reportHash, score, high, flag, ruleset, uint64(block.timestamp)));
        emit Attested(docHash, reportHash, score, high, flag, ruleset);
    }

    function reviews(bytes32 docHash) external view returns (Attestation[] memory) { return _byDoc[docHash]; }
    function latest(bytes32 docHash) external view returns (Attestation memory) {
        Attestation[] storage a = _byDoc[docHash]; require(a.length > 0, "not reviewed"); return a[a.length - 1];
    }
    function supportsInterface(bytes4 id) external pure override returns (bool) {
        return id == type(IReceiver).interfaceId || id == type(IERC165).interfaceId;
    }
}
