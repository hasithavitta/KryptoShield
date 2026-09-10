import { parseAbi } from 'viem';

export const CONTRACT_ADDRESS = "0x22f89c0a6772B743a6aB66fc7EF4E757a389766a";

export const ROLES = {
  ADMIN: "0x0000000000000000000000000000000000000000000000000000000000000000",
  MANAGER: "0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08",
  AUDITOR: "0x8a9d1d6dc9b8e96bf4ec5ffbdf0b71947e452a265691079fb32338b251cc6eb2"
} as const;

export const CONTRACT_ABI = parseAbi([
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function grantRole(bytes32 role, address account)",
  "function revokeRole(bytes32 role, address account)",
  "function mintAsset(address recipient, string memory uri) returns (uint256)",
  "event AssetMinted(uint256 indexed tokenId, address indexed recipient, string tokenURI)",
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)"
]);