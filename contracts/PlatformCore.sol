// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract PlatformCore is ERC721URIStorage, AccessControl {
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    uint256 private _nextTokenId;

    event AssetMinted(uint256 indexed tokenId, address indexed recipient, string tokenURI);

    constructor(address rootAdmin) ERC721("CorporateAsset", "CASSET") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        if (rootAdmin != address(0) && rootAdmin != msg.sender) {
            _grantRole(DEFAULT_ADMIN_ROLE, rootAdmin);
        }
    }

    function mintAsset(address recipient, string memory uri) external onlyRole(MANAGER_ROLE) returns (uint256) {
        uint256 tokenId = ++_nextTokenId;
        _safeMint(recipient, tokenId);
        _setTokenURI(tokenId, uri);
        emit AssetMinted(tokenId, recipient, uri);
        return tokenId;
    }

    // Required override for AccessControl + ERC721
    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
