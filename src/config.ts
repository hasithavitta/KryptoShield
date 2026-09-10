import { parseAbi } from 'viem';

export const CONTRACT_ADDRESS = "0x5e34eDb37a0Ff989fB38601953176eA1284c5331";

// Designated Admin wallet address for the application
export const INITIAL_ADMIN_ADDRESS = "0xB9B4a83d0B3fB8e3519D91f30B541dec230482e8";

export const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
export const MANAGER_ROLE = "0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08" as const;
export const AUDITOR_ROLE = "0x59a1c48e5837ad7a7f3dcedcbe129bf3249ec4fbf651fd4f5e2600ead39fe2f5" as const;

export const ROLES = {
  ADMIN: DEFAULT_ADMIN_ROLE,
  MANAGER: MANAGER_ROLE,
  AUDITOR: AUDITOR_ROLE
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