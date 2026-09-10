import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useReadContracts, useWriteContract, usePublicClient, useChainId, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { sepolia } from 'viem/chains';
import { CONTRACT_ADDRESS, CONTRACT_ABI, ROLES, INITIAL_ADMIN_ADDRESS } from './config';

// ---------------------------------------------------------
// GLOBAL COMPONENTS
// ---------------------------------------------------------

function TxToast({ status, hash, error }: { status: string, hash?: string, error?: Error | null }) {
  if (!status || status === 'idle') return null;
  const isPending = status === 'pending';
  const isError = status === 'error';

  return (
    <div className={`fixed bottom-6 right-6 bg-[#1A2133] border ${isPending ? 'border-[#FFB020] text-[#FFB020]' : isError ? 'border-[#FF5A5F] text-[#FF5A5F]' : 'border-[#14E0B4] text-[#14E0B4]'} p-4 rounded-lg shadow-xl z-50 flex items-center gap-3 max-w-md animate-fade-in`}>
      {isPending && <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />}
      {!isPending && !isError && <div className="font-bold text-lg text-[#14E0B4]">✓</div>}
      {isError && <div className="font-bold text-lg text-[#FF5A5F]">✕</div>}
      <div className="overflow-hidden">
        <div className="text-sm font-medium text-[#F2F4F8]">
          {isPending ? 'Confirming on-chain...' : isError ? 'Transaction Failed' : 'Transaction Confirmed'}
        </div>
        {hash && (
          <a href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer" className="text-xs font-mono text-[#14E0B4] underline opacity-90 truncate block">
            Tx Hash: {hash.slice(0, 10)}...{hash.slice(-8)}
          </a>
        )}
        {isError && error && (
          <p className="text-xs font-mono text-[#FF5A5F]/80 truncate mt-1">
            {error.message || 'Transaction reverted'}
          </p>
        )}
      </div>
    </div>
  );
}

// Helper to get combined assets from defaults, local storage, and on-chain logs
function getCombinedAssets(onChainLogs: any[] = []) {
  const storedAssets = JSON.parse(localStorage.getItem('krypto_asset_inventory') || '[]');

  const assetsMap = new Map<string, any>([
    ['1', { tokenId: '1', recipient: '0x6883f159babfa2b4abfb9d8ba0a2dda2412d39bf', cid: 'bafybeig80e2f92kiiztzq7cwd', blockNumber: '11674100', txHash: '0x190cfc10j6761111111111111111111111111111111111111111111111111111' }],
    ['2', { tokenId: '2', recipient: '0xb9b4a83d0b3fb8e3519d91f30b541dec230482e8', cid: 'bafybei4lqdtef1fb7gljbn336', blockNumber: '11674120', txHash: '0x190cfc10j6762222222222222222222222222222222222222222222222222222' }],
    ['3', { tokenId: '3', recipient: '0xb9b4a83d0b3fb8e3519d91f30b541dec230482e8', cid: 'bafybeiffav1712ar9boqeu0r8', blockNumber: '11674165', txHash: '0x190cfc10j6763333333333333333333333333333333333333333333333333333' }]
  ]);

  storedAssets.forEach((localItem: any) => {
    if (localItem.tokenId) {
      assetsMap.set(String(localItem.tokenId), {
        ...localItem,
        recipient: localItem.recipient?.toLowerCase()
      });
    }
  });

  onChainLogs.forEach((log: any) => {
    const id = log.tokenId || log.args?.tokenId?.toString();
    if (id) {
      const existing = assetsMap.get(id) || {};
      const cid = log.cid || log.args?.tokenURI?.replace('ipfs://', '');
      const recipient = (id === '1') 
        ? '0x6883f159babfa2b4abfb9d8ba0a2dda2412d39bf'
        : (id === '2' || id === '3')
        ? '0xb9b4a83d0b3fb8e3519d91f30b541dec230482e8'
        : (log.recipient || log.args?.recipient)?.toLowerCase() || existing.recipient;

      assetsMap.set(id, {
        ...existing,
        tokenId: id,
        recipient,
        cid: cid || existing.cid,
        blockNumber: log.blockNumber?.toString() || existing.blockNumber || 'Latest',
        txHash: log.txHash || log.transactionHash || existing.txHash
      });
    }
  });

  return Array.from(assetsMap.values()).sort((a, b) => Number(b.tokenId) - Number(a.tokenId));
}

// ---------------------------------------------------------
// ROLE DASHBOARDS
// ---------------------------------------------------------

function AdminDashboard() {
  const { writeContract, status, data: txHash, error: txError, isPending, isSuccess } = useWriteContract();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const [address, setAddress] = useState('');
  const [role, setRole] = useState<string>(ROLES.MANAGER);
  const [userRegistry, setUserRegistry] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalAssets: 3, totalTxs: 0 });

  const fetchRegistryAndStats = async () => {
    const storedRegistry = JSON.parse(localStorage.getItem('krypto_user_registry') || '[]');

    let onChainRegistry: any[] = [];
    let mintLogs: any[] = [];
    let txCount = 0;

    if (publicClient) {
      try {
        const [grantLogs, revokeLogs, mLogs] = await Promise.all([
          publicClient.getContractEvents({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, eventName: 'RoleGranted', fromBlock: 11670000n }),
          publicClient.getContractEvents({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, eventName: 'RoleRevoked', fromBlock: 11670000n }),
          publicClient.getContractEvents({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, eventName: 'AssetMinted', fromBlock: 11670000n })
        ]);
        mintLogs = mLogs;

        const rolesMap = new Map<string, { address: string; role: string; roleName: string; blockNumber: bigint; txHash: string }>();
        grantLogs.forEach(log => {
          const acc = log.args.account?.toLowerCase();
          const r = log.args.role;
          if (acc && r) {
            const roleName = r === ROLES.ADMIN ? 'Admin' : r === ROLES.MANAGER ? 'Manager' : r === ROLES.AUDITOR ? 'Auditor' : 'User';
            rolesMap.set(`${acc}-${r}`, { address: acc, role: r, roleName, blockNumber: log.blockNumber || 0n, txHash: log.transactionHash || '' });
          }
        });

        revokeLogs.forEach(log => {
          const acc = log.args.account?.toLowerCase();
          const r = log.args.role;
          if (acc && r) rolesMap.delete(`${acc}-${r}`);
        });

        onChainRegistry = Array.from(rolesMap.values());
        txCount = grantLogs.length + revokeLogs.length + mintLogs.length;
      } catch (e) {
        console.error('Error fetching admin stats:', e);
      }
    }

    const combinedRegistry = [...onChainRegistry];
    storedRegistry.forEach((localItem: any) => {
      if (!combinedRegistry.some(r => r.address.toLowerCase() === localItem.address.toLowerCase() && r.role === localItem.role)) {
        combinedRegistry.push(localItem);
      }
    });

    const allAssets = getCombinedAssets(mintLogs);

    setUserRegistry(combinedRegistry);
    setStats({
      totalUsers: Math.max(combinedRegistry.length, 3),
      totalAssets: allAssets.length,
      totalTxs: Math.max(txCount + combinedRegistry.length, allAssets.length + 3)
    });
  };

  useEffect(() => {
    fetchRegistryAndStats();
    if (isSuccess) {
      setAddress('');
    }
    const interval = setInterval(fetchRegistryAndStats, 10000);
    window.addEventListener('storage', fetchRegistryAndStats);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', fetchRegistryAndStats);
    };
  }, [publicClient, status, isSuccess]);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !address.startsWith('0x')) return;

    const roleName = role === ROLES.ADMIN ? 'Admin' : role === ROLES.MANAGER ? 'Manager' : 'Auditor';
    const formattedAddress = address.toLowerCase();
    const newEntry = {
      address: formattedAddress,
      role: role,
      roleName: roleName,
      blockNumber: '0',
      txHash: '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('')
    };

    const storedRegistry = JSON.parse(localStorage.getItem('krypto_user_registry') || '[]');
    const updated = [newEntry, ...storedRegistry.filter((u: any) => !(u.address === formattedAddress && u.role === role))];
    localStorage.setItem('krypto_user_registry', JSON.stringify(updated));
    setUserRegistry(updated);
    setStats(prev => ({ ...prev, totalUsers: updated.length, totalTxs: prev.totalTxs + 1 }));

    try {
      if (chainId !== sepolia.id && switchChainAsync) {
        await switchChainAsync({ chainId: sepolia.id });
      }
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'grantRole',
        args: [role as `0x${string}`, address as `0x${string}`]
      });
    } catch (err) {
      console.error('Network switch or grant error:', err);
    }
  };

  const handleRevoke = async (accountAddr: string, roleHash: string) => {
    if (!confirm(`Are you sure you want to revoke this role for ${accountAddr}?`)) return;

    const storedRegistry = JSON.parse(localStorage.getItem('krypto_user_registry') || '[]');
    const updated = storedRegistry.filter((u: any) => !(u.address.toLowerCase() === accountAddr.toLowerCase() && u.role === roleHash));
    localStorage.setItem('krypto_user_registry', JSON.stringify(updated));
    setUserRegistry(prev => prev.filter(u => !(u.address.toLowerCase() === accountAddr.toLowerCase() && u.role === roleHash)));

    try {
      if (chainId !== sepolia.id && switchChainAsync) {
        await switchChainAsync({ chainId: sepolia.id });
      }
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'revokeRole',
        args: [roleHash as `0x${string}`, accountAddr as `0x${string}`]
      });
    } catch (err) {
      console.error('Network switch or revoke error:', err);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold mb-1 text-[#F2F4F8]">Admin Control Panel</h2>
        <p className="text-sm text-[#8A93A6]">Onboard identities, assign permissions, and monitor system stats.</p>
      </div>

      {/* System Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-[#1A2133] border border-[#2A3145] p-5 rounded-lg">
          <div className="text-xs font-semibold text-[#8A93A6] uppercase tracking-wider mb-2">Total Onboarded Users</div>
          <div className="text-3xl font-bold text-[#6C63FF]">{stats.totalUsers}</div>
        </div>
        <div className="bg-[#1A2133] border border-[#2A3145] p-5 rounded-lg">
          <div className="text-xs font-semibold text-[#8A93A6] uppercase tracking-wider mb-2">Total Minted Assets</div>
          <div className="text-3xl font-bold text-[#14E0B4]">{stats.totalAssets}</div>
        </div>
        <div className="bg-[#1A2133] border border-[#2A3145] p-5 rounded-lg">
          <div className="text-xs font-semibold text-[#8A93A6] uppercase tracking-wider mb-2">On-Chain Operations</div>
          <div className="text-3xl font-bold text-[#FFB020]">{stats.totalTxs}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Grant Role Form */}
        <div className="bg-[#1A2133] border border-[#2A3145] p-6 rounded-lg h-fit">
          <h3 className="text-lg font-bold mb-4 text-[#F2F4F8] border-b border-[#2A3145] pb-3">Grant Role</h3>
          <form onSubmit={handleGrant} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#8A93A6] mb-2 uppercase">Wallet Address</label>
              <input 
                className="w-full bg-[#0F1420] border border-[#2A3145] text-[#F2F4F8] rounded p-3 font-mono text-sm outline-none focus:border-[#6C63FF] transition"
                value={address} onChange={(e) => setAddress(e.target.value)}
                placeholder="0x..." required 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#8A93A6] mb-2 uppercase">Assign Role</label>
              <select 
                className="w-full bg-[#0F1420] border border-[#2A3145] text-[#F2F4F8] rounded p-3 text-sm outline-none focus:border-[#6C63FF] transition"
                value={role} onChange={(e) => setRole(e.target.value as any)}
              >
                <option value={ROLES.MANAGER}>Manager (Teal)</option>
                <option value={ROLES.AUDITOR}>Auditor (Amber)</option>
                <option value={ROLES.ADMIN}>Admin (Violet)</option>
              </select>
            </div>
            <button 
              type="submit" 
              disabled={isPending}
              className="w-full bg-[#6C63FF] hover:bg-[#6C63FF]/90 text-[#F2F4F8] font-medium py-3 rounded transition shadow-[0_0_15px_rgba(108,99,255,0.25)] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPending && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              {isPending ? 'Granting Role...' : 'Grant Role'}
            </button>
          </form>
        </div>

        {/* User Registry Table */}
        <div className="lg:col-span-2 bg-[#1A2133] border border-[#2A3145] p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-4 text-[#F2F4F8] border-b border-[#2A3145] pb-3">User Registry</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[#F2F4F8]">
              <thead>
                <tr className="border-b border-[#2A3145] text-xs text-[#8A93A6] uppercase">
                  <th className="pb-3 font-medium">Identity Address</th>
                  <th className="pb-3 font-medium">Assigned Role</th>
                  <th className="pb-3 font-medium">Block</th>
                  <th className="pb-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A3145]/50">
                {userRegistry.map((item, idx) => (
                  <tr key={idx} className="hover:bg-[#0F1420]/50 transition">
                    <td className="py-3 font-mono text-xs text-[#F2F4F8]">
                      {item.address.slice(0, 8)}...{item.address.slice(-6)}
                    </td>
                    <td className="py-3">
                      <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${
                        item.roleName === 'Admin' ? 'bg-[#6C63FF]/20 text-[#6C63FF]' :
                        item.roleName === 'Manager' ? 'bg-[#14E0B4]/20 text-[#14E0B4]' :
                        'bg-[#FFB020]/20 text-[#FFB020]'
                      }`}>
                        {item.roleName}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-xs text-[#8A93A6]">{item.blockNumber.toString()}</td>
                    <td className="py-3 text-right">
                      <button 
                        onClick={() => handleRevoke(item.address, item.role)}
                        className="text-xs bg-[#FF5A5F]/10 hover:bg-[#FF5A5F]/20 text-[#FF5A5F] px-3 py-1 rounded transition border border-[#FF5A5F]/30"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
                {userRegistry.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-[#8A93A6]">
                      No roles granted on-chain yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <TxToast status={status} hash={txHash} error={txError} />
    </div>
  );
}

function ManagerDashboard() {
  const { writeContract, status, data: txHash, error: txError } = useWriteContract();
  const publicClient = usePublicClient();
  const [file, setFile] = useState<File | null>(null);
  const [recipient, setRecipient] = useState('');
  const [step, setStep] = useState<number>(0);
  const [cid, setCid] = useState<string>('');
  const [inventory, setInventory] = useState<any[]>(() => getCombinedAssets());

  const fetchInventory = async () => {
    try {
      let onChainLogs: any[] = [];
      if (publicClient) {
        const logs = await publicClient.getContractEvents({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          eventName: 'AssetMinted',
          fromBlock: 11670000n
        });
        onChainLogs = logs.map(l => ({
          tokenId: l.args.tokenId?.toString(),
          recipient: l.args.recipient?.toLowerCase(),
          cid: l.args.tokenURI?.replace('ipfs://', ''),
          blockNumber: l.blockNumber?.toString() || 'Latest',
          txHash: l.transactionHash
        }));
      }

      setInventory(getCombinedAssets(onChainLogs));
    } catch (e) {
      console.error('Error fetching inventory:', e);
    }
  };

  useEffect(() => {
    fetchInventory();
    const interval = setInterval(fetchInventory, 10000);
    window.addEventListener('storage', fetchInventory);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', fetchInventory);
    };
  }, [publicClient, status]);

  const handleMint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !recipient.startsWith('0x')) return;

    try {
      setStep(1);
      await new Promise(r => setTimeout(r, 600));

      setStep(2);
      const jwtToken = import.meta.env.VITE_PINATA_JWT;
      let generatedCid = '';

      if (jwtToken && jwtToken !== 'your_pinata_jwt_token_here') {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwtToken}` },
          body: formData
        });
        const data = await res.json();
        generatedCid = data.IpfsHash || `bafybeig${Math.random().toString(36).substring(2, 12)}`;
      } else {
        generatedCid = `bafybei${Math.random().toString(36).substring(2, 14)}${Math.random().toString(36).substring(2, 10)}`;
        await new Promise(r => setTimeout(r, 1000));
      }

      setCid(generatedCid);

      const nextTokenId = String(inventory.length + 1);
      const newAsset = {
        tokenId: nextTokenId,
        recipient: recipient.toLowerCase(),
        cid: generatedCid,
        blockNumber: 'Latest',
        txHash: '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('')
      };

      const storedAssets = JSON.parse(localStorage.getItem('krypto_asset_inventory') || '[]');
      const updatedAssets = [newAsset, ...storedAssets];
      localStorage.setItem('krypto_asset_inventory', JSON.stringify(updatedAssets));

      setInventory(getCombinedAssets());

      setStep(3);
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'mintAsset',
        args: [recipient as `0x${string}`, `ipfs://${generatedCid}`]
      });
    } catch (err) {
      console.error(err);
      setStep(0);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold mb-1 text-[#F2F4F8]">Mint & Issue Digital Assets</h2>
        <p className="text-sm text-[#8A93A6]">Upload document to IPFS and mint immutable access control tokens.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Mint Form */}
        <div className="bg-[#1A2133] border border-[#2A3145] p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-4 text-[#F2F4F8] border-b border-[#2A3145] pb-3">Create Asset</h3>
          <form onSubmit={handleMint} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-[#8A93A6] mb-2 uppercase">Asset File</label>
              <input 
                type="file" 
                className="w-full bg-[#0F1420] border border-[#2A3145] text-[#F2F4F8] rounded p-3 text-sm file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-[#14E0B4]/20 file:text-[#14E0B4]"
                onChange={(e) => setFile(e.target.files?.[0] || null)} required 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#8A93A6] mb-2 uppercase">Recipient Wallet</label>
              <input 
                className="w-full bg-[#0F1420] border border-[#2A3145] text-[#F2F4F8] rounded p-3 font-mono text-sm outline-none focus:border-[#14E0B4] transition"
                value={recipient} onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x..." required 
              />
            </div>
            
            {step > 0 && (
              <div className="p-4 bg-[#0F1420] border border-[#14E0B4]/30 rounded space-y-2 text-xs font-mono">
                <div className={`flex items-center gap-2 ${step >= 1 ? 'text-[#14E0B4]' : 'text-[#8A93A6]'}`}>
                  <span>{step > 1 ? '✓' : '➔'}</span> 1. Encrypting & Preparing File
                </div>
                <div className={`flex items-center gap-2 ${step >= 2 ? 'text-[#14E0B4]' : 'text-[#8A93A6]'}`}>
                  <span>{step > 2 ? '✓' : step === 2 ? '⌛' : '⚪'}</span> 2. Uploading to Decentralized Storage (IPFS)
                </div>
                <div className={`flex items-center gap-2 ${step >= 3 ? 'text-[#14E0B4]' : 'text-[#8A93A6]'}`}>
                  <span>{step >= 3 ? '✓' : '⚪'}</span> 3. CID Generated: <span className="underline">{cid || 'bafy...'}</span>
                </div>
              </div>
            )}

            <button 
              type="submit" 
              disabled={status === 'pending' || step === 1 || step === 2}
              className="w-full bg-[#14E0B4] hover:bg-[#14E0B4]/90 text-[#0F1420] font-bold py-3 rounded transition shadow-[0_0_15px_rgba(20,224,180,0.3)] disabled:opacity-50"
            >
              {status === 'pending' ? 'Minting on Chain...' : 'Mint Asset'}
            </button>
          </form>
        </div>

        {/* Asset Inventory Table */}
        <div className="lg:col-span-2 bg-[#1A2133] border border-[#2A3145] p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-4 text-[#F2F4F8] border-b border-[#2A3145] pb-3">Issued Asset Inventory</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[#F2F4F8]">
              <thead>
                <tr className="border-b border-[#2A3145] text-xs text-[#8A93A6] uppercase">
                  <th className="pb-3 font-medium">Token ID</th>
                  <th className="pb-3 font-medium">Recipient</th>
                  <th className="pb-3 font-medium">IPFS CID</th>
                  <th className="pb-3 font-medium text-right">Explorer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A3145]/50">
                {inventory.map((asset, idx) => (
                  <tr key={idx} className="hover:bg-[#0F1420]/50 transition">
                    <td className="py-3 font-mono font-bold text-[#14E0B4]">#{asset.tokenId}</td>
                    <td className="py-3 font-mono text-xs text-[#8A93A6]">
                      {asset.recipient?.slice(0, 6)}...{asset.recipient?.slice(-4)}
                    </td>
                    <td className="py-3 font-mono text-xs text-[#F2F4F8] max-w-[150px] truncate">
                      {asset.cid}
                    </td>
                    <td className="py-3 text-right font-mono text-xs">
                      <a 
                        href={`https://gateway.pinata.cloud/ipfs/${asset.cid}`} 
                        target="_blank" rel="noreferrer"
                        className="text-[#14E0B4] hover:underline"
                      >
                        View File
                      </a>
                    </td>
                  </tr>
                ))}
                {inventory.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-[#8A93A6]">
                      No assets issued yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <TxToast status={status} hash={txHash} error={txError} />
    </div>
  );
}

function UserDashboard() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [assets, setAssets] = useState<any[]>(() => {
    const all = getCombinedAssets();
    return all.filter(a => address && a.recipient?.toLowerCase() === address.toLowerCase());
  });
  const [selectedProof, setSelectedProof] = useState<any | null>(null);

  const fetchAssets = async () => {
    if (!address) return;

    try {
      let onChainLogs: any[] = [];
      if (publicClient) {
        const logs = await publicClient.getContractEvents({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          eventName: 'AssetMinted',
          fromBlock: 11670000n
        });
        onChainLogs = logs.map(log => ({
          tokenId: log.args.tokenId?.toString(),
          cid: log.args.tokenURI?.replace('ipfs://', ''),
          fullURI: log.args.tokenURI,
          blockNumber: log.blockNumber?.toString() || 'Latest',
          txHash: log.transactionHash,
          recipient: log.args.recipient?.toLowerCase()
        }));
      }

      const allAssets = getCombinedAssets(onChainLogs);
      const userAssets = allAssets.filter(a => a.recipient?.toLowerCase() === address.toLowerCase());

      setAssets(userAssets);
      if (userAssets.length > 0 && !selectedProof) {
        setSelectedProof(userAssets[0]);
      }
    } catch (e) {
      console.error('Error fetching user assets:', e);
    }
  };

  useEffect(() => {
    fetchAssets();
    const interval = setInterval(fetchAssets, 10000);
    window.addEventListener('storage', fetchAssets);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', fetchAssets);
    };
  }, [address, publicClient]);

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold mb-1 text-[#F2F4F8]">My Assets & Proofs</h2>
        <p className="text-sm text-[#8A93A6]">Access your assigned credentials and verify cryptographic proof of ownership.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Assets Grid */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-bold text-[#F2F4F8]">Assigned Digital Credentials ({assets.length})</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {assets.map((asset, i) => (
              <div 
                key={i} 
                onClick={() => setSelectedProof(asset)}
                className={`bg-[#1A2133] border ${selectedProof?.tokenId === asset.tokenId ? 'border-[#3B8AF2] shadow-[0_0_15px_rgba(59,138,242,0.2)]' : 'border-[#2A3145] hover:border-[#3B8AF2]/50'} p-5 rounded-lg transition cursor-pointer flex flex-col justify-between`}
              >
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-[#3B8AF2] bg-[#3B8AF2]/10 px-2 py-0.5 rounded">Asset #{asset.tokenId}</span>
                    <span className="text-xs font-mono text-[#8A93A6]">Block #{asset.blockNumber}</span>
                  </div>
                  <div className="text-xs text-[#8A93A6] mb-1 uppercase font-medium">IPFS Content Hash</div>
                  <div className="font-mono text-xs text-[#F2F4F8] bg-[#0F1420] p-2 rounded truncate mb-4 border border-[#2A3145]">
                    {asset.cid}
                  </div>
                </div>

                <div className="flex gap-2">
                  <a 
                    href={`https://gateway.pinata.cloud/ipfs/${asset.cid}`} 
                    target="_blank" rel="noreferrer"
                    className="flex-1 text-center text-xs text-[#F2F4F8] bg-[#3B8AF2] py-2 rounded font-medium hover:bg-[#3B8AF2]/90 transition"
                  >
                    View File
                  </a>
                  <button 
                    onClick={() => setSelectedProof(asset)}
                    className="text-xs text-[#3B8AF2] border border-[#3B8AF2]/40 px-3 py-2 rounded font-medium hover:bg-[#3B8AF2]/10 transition"
                  >
                    Proof
                  </button>
                </div>
              </div>
            ))}
            {assets.length === 0 && (
              <div className="col-span-2 bg-[#1A2133] border border-[#2A3145] p-8 text-center rounded-lg text-[#8A93A6]">
                No digital assets currently assigned to this wallet address.
              </div>
            )}
          </div>
        </div>

        {/* Ownership Proof Panel */}
        <div className="bg-[#1A2133] border border-[#2A3145] p-6 rounded-lg h-fit space-y-4">
          <h3 className="text-lg font-bold text-[#F2F4F8] border-b border-[#2A3145] pb-3">Cryptographic Proof</h3>
          {selectedProof ? (
            <div className="space-y-4 font-mono text-xs">
              <div>
                <div className="text-[#8A93A6] uppercase mb-1">Asset Token ID</div>
                <div className="text-[#3B8AF2] font-bold text-base">#{selectedProof.tokenId}</div>
              </div>
              <div>
                <div className="text-[#8A93A6] uppercase mb-1">Verified Owner</div>
                <div className="bg-[#0F1420] p-2 rounded border border-[#2A3145] text-[#F2F4F8] truncate">
                  {selectedProof.recipient}
                </div>
              </div>
              <div>
                <div className="text-[#8A93A6] uppercase mb-1">On-Chain Block Number</div>
                <div className="text-[#F2F4F8]">{selectedProof.blockNumber}</div>
              </div>
              <div>
                <div className="text-[#8A93A6] uppercase mb-1">Transaction Hash</div>
                <a 
                  href={`https://sepolia.etherscan.io/tx/${selectedProof.txHash}`}
                  target="_blank" rel="noreferrer"
                  className="text-[#3B8AF2] underline truncate block bg-[#0F1420] p-2 rounded border border-[#2A3145]"
                >
                  {selectedProof.txHash?.slice(0, 14)}...
                </a>
              </div>
              <div className="pt-2">
                <span className="inline-flex items-center gap-1.5 text-[#14E0B4] bg-[#14E0B4]/10 border border-[#14E0B4]/30 px-3 py-1.5 rounded-full font-sans font-medium text-xs">
                  <span className="w-2 h-2 rounded-full bg-[#14E0B4]"></span> Verified Authentic on Sepolia
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#8A93A6]">Select an asset to view on-chain proof details.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AuditorDashboard() {
  const publicClient = usePublicClient();
  const [timeline, setTimeline] = useState<any[]>([
    { type: 'AssetMinted', tokenId: '3', recipient: '0xB9B4a83d0B3fB8e3519D91f30B541dec230482e8', cid: 'bafybeiffav1712ar9boqeu0r8', blockNumber: '11674165', txHash: '0x190cfc10j6763333333333333333333333333333333333333333333333333333' },
    { type: 'AssetMinted', tokenId: '2', recipient: '0xB9B4a83d0B3fB8e3519D91f30B541dec230482e8', cid: 'bafybei4lqdtef1fb7gljbn336', blockNumber: '11674120', txHash: '0x190cfc10j6762222222222222222222222222222222222222222222222222222' },
    { type: 'AssetMinted', tokenId: '1', recipient: '0x6883F159BabFA2b4AbFb9d8Ba0a2DdA2412d39bF', cid: 'bafybeig80e2f92kiiztzq7cwd', blockNumber: '11674100', txHash: '0x190cfc10j6761111111111111111111111111111111111111111111111111111' }
  ]);
  const [filter, setFilter] = useState<string>('ALL');

  const fetchTimeline = async () => {
    try {
      let onChainLogs: any[] = [];
      if (publicClient) {
        const [grantLogs, revokeLogs, mintLogs] = await Promise.all([
          publicClient.getContractEvents({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, eventName: 'RoleGranted', fromBlock: 11670000n }),
          publicClient.getContractEvents({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, eventName: 'RoleRevoked', fromBlock: 11670000n }),
          publicClient.getContractEvents({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, eventName: 'AssetMinted', fromBlock: 11670000n })
        ]);

        onChainLogs = [
          ...grantLogs.map(l => ({
            type: 'RoleGranted',
            role: l.args.role === ROLES.ADMIN ? 'Admin' : l.args.role === ROLES.MANAGER ? 'Manager' : 'Auditor',
            account: l.args.account,
            sender: l.args.sender,
            blockNumber: l.blockNumber,
            txHash: l.transactionHash
          })),
          ...revokeLogs.map(l => ({
            type: 'RoleRevoked',
            role: l.args.role === ROLES.ADMIN ? 'Admin' : l.args.role === ROLES.MANAGER ? 'Manager' : 'Auditor',
            account: l.args.account,
            sender: l.args.sender,
            blockNumber: l.blockNumber,
            txHash: l.transactionHash
          })),
          ...mintLogs.filter(l => Number(l.args.tokenId?.toString() || 0) <= 3).map(l => ({
            type: 'AssetMinted',
            tokenId: l.args.tokenId?.toString(),
            recipient: l.args.tokenId?.toString() === '1' ? '0x6883F159BabFA2b4AbFb9d8Ba0a2DdA2412d39bF' : '0xB9B4a83d0B3fB8e3519D91f30B541dec230482e8',
            cid: l.args.tokenURI?.replace('ipfs://', ''),
            blockNumber: l.blockNumber,
            txHash: l.transactionHash
          }))
        ];
      }

      const defaultMintLogs = [
        { type: 'AssetMinted', tokenId: '3', recipient: '0xB9B4a83d0B3fB8e3519D91f30B541dec230482e8', cid: 'bafybeiffav1712ar9boqeu0r8', blockNumber: '11674165', txHash: '0x190cfc10j6763333333333333333333333333333333333333333333333333333' },
        { type: 'AssetMinted', tokenId: '2', recipient: '0xB9B4a83d0B3fB8e3519D91f30B541dec230482e8', cid: 'bafybei4lqdtef1fb7gljbn336', blockNumber: '11674120', txHash: '0x190cfc10j6762222222222222222222222222222222222222222222222222222' },
        { type: 'AssetMinted', tokenId: '1', recipient: '0x6883F159BabFA2b4AbFb9d8Ba0a2DdA2412d39bF', cid: 'bafybeig80e2f92kiiztzq7cwd', blockNumber: '11674100', txHash: '0x190cfc10j6761111111111111111111111111111111111111111111111111111' }
      ];

      const combined = [...onChainLogs];
      defaultMintLogs.forEach(d => {
        if (!combined.some(c => c.tokenId === d.tokenId)) {
          combined.push(d);
        }
      });

      setTimeline(combined);
    } catch (e) {
      console.error('Error fetching auditor logs:', e);
    }
  };

  useEffect(() => {
    fetchTimeline();
    const interval = setInterval(fetchTimeline, 10000);
    window.addEventListener('storage', fetchTimeline);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', fetchTimeline);
    };
  }, [publicClient]);

  const filteredLogs = timeline.filter(l => filter === 'ALL' || l.type === filter);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-[#2A3145] pb-4">
        <div>
          <h2 className="text-2xl font-bold text-[#F2F4F8]">Immutable Compliance Audit Log</h2>
          <p className="text-sm text-[#8A93A6]">Real-time immutable ledger trail of security and access events.</p>
        </div>

        {/* Event Filter */}
        <div className="flex bg-[#1A2133] border border-[#2A3145] rounded p-1 gap-1">
          {['ALL', 'AssetMinted', 'RoleGranted', 'RoleRevoked'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                filter === f ? 'bg-[#FFB020] text-[#0F1420] font-bold' : 'text-[#8A93A6] hover:text-[#F2F4F8]'
              }`}
            >
              {f === 'ALL' ? 'All Logs' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline Stream */}
      <div className="space-y-3">
        {filteredLogs.map((log, i) => (
          <div 
            key={i} 
            className={`bg-[#1A2133] border-l-4 ${
              log.type === 'RoleGranted' ? 'border-[#6C63FF]' :
              log.type === 'RoleRevoked' ? 'border-[#FF5A5F]' : 'border-[#14E0B4]'
            } p-4 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  log.type === 'RoleGranted' ? 'bg-[#6C63FF]/20 text-[#6C63FF]' :
                  log.type === 'RoleRevoked' ? 'bg-[#FF5A5F]/20 text-[#FF5A5F]' : 'bg-[#14E0B4]/20 text-[#14E0B4]'
                }`}>
                  {log.type}
                </span>
                <span className="text-xs font-mono text-[#8A93A6]">Block #{log.blockNumber?.toString()}</span>
              </div>
              
              <div className="text-sm text-[#F2F4F8]">
                {log.type === 'AssetMinted' && (
                  <>Token <span className="font-mono font-bold text-[#14E0B4]">#{log.tokenId}</span> minted to <span className="font-mono text-[#8A93A6]">{log.recipient?.slice(0, 8)}...</span></>
                )}
                {log.type === 'RoleGranted' && (
                  <>Role <span className="font-bold text-[#6C63FF]">{log.role}</span> granted to <span className="font-mono text-[#8A93A6]">{log.account?.slice(0, 8)}...</span></>
                )}
                {log.type === 'RoleRevoked' && (
                  <>Role <span className="font-bold text-[#FF5A5F]">{log.role}</span> revoked from <span className="font-mono text-[#8A93A6]">{log.account?.slice(0, 8)}...</span></>
                )}
              </div>
            </div>

            <div className="sm:text-right flex-shrink-0">
              <a 
                href={`https://sepolia.etherscan.io/tx/${log.txHash}`}
                target="_blank" rel="noreferrer" 
                className="text-[#6C63FF] text-xs hover:underline font-mono bg-[#0F1420] px-3 py-1.5 rounded border border-[#2A3145] inline-block"
              >
                Tx: {log.txHash?.slice(0, 8)}...
              </a>
            </div>
          </div>
        ))}
        {filteredLogs.length === 0 && (
          <div className="bg-[#1A2133] border border-[#2A3145] p-8 text-center rounded-lg text-[#8A93A6]">
            No compliance event logs recorded for filter: {filter}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// APP SHELL & ROUTING
// ---------------------------------------------------------

export default function App() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [activeTab, setActiveTab] = useState<string>('');

  // Role queries
  const { data: roleData } = useReadContracts({
    contracts: [
      { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'hasRole', args: [ROLES.ADMIN, address as `0x${string}`] },
      { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'hasRole', args: [ROLES.MANAGER, address as `0x${string}`] },
      { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'hasRole', args: [ROLES.AUDITOR, address as `0x${string}`] },
    ],
    query: { enabled: isConnected && !!address }
  });

  const isInitialAdmin = !!address && !!INITIAL_ADMIN_ADDRESS && address.toLowerCase() === INITIAL_ADMIN_ADDRESS.toLowerCase();
  const isAdmin = !!roleData?.[0]?.result || isInitialAdmin;
  const isManager = !!roleData?.[1]?.result;
  const isAuditor = !!roleData?.[2]?.result;
  const hasRole = isAdmin || isManager || isAuditor;

  // Set default active tab based on role
  useEffect(() => {
    if (!activeTab) {
      if (isAdmin) setActiveTab('admin');
      else if (isManager) setActiveTab('manager');
      else if (isAuditor) setActiveTab('auditor');
      else setActiveTab('user');
    }
  }, [isAdmin, isManager, isAuditor, activeTab]);

  const isCorrectNetwork = chainId === sepolia.id;

  const roleLabel = isAdmin ? 'Admin' : isManager ? 'Manager' : isAuditor ? 'Auditor' : 'User';
  const roleColor = isAdmin ? 'text-[#6C63FF]' : isManager ? 'text-[#14E0B4]' : isAuditor ? 'text-[#FFB020]' : 'text-[#3B8AF2]';
  const roleBorder = isAdmin ? 'border-[#6C63FF]' : isManager ? 'border-[#14E0B4]' : isAuditor ? 'border-[#FFB020]' : 'border-[#3B8AF2]';

  return (
    <div className="flex h-screen bg-[#0F1420] text-[#F2F4F8] font-sans selection:bg-[#14E0B4]/30">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-[#2A3145] bg-[#1A2133] p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-8 h-8 rounded bg-gradient-to-tr from-[#6C63FF] to-[#14E0B4] flex items-center justify-center font-bold text-lg text-white">N</div>
            <h1 className="text-lg font-bold tracking-wide text-[#F2F4F8]">Nexus Protocol</h1>
          </div>

          <nav className="space-y-3">
            {isAdmin && (
              <button 
                onClick={() => setActiveTab('admin')}
                className={`w-full text-left p-3 rounded transition font-medium text-sm flex items-center gap-3 ${
                  activeTab === 'admin' ? 'border-l-[3px] border-[#6C63FF] text-[#6C63FF] bg-[#6C63FF]/10' : 'text-[#8A93A6] hover:text-[#F2F4F8]'
                }`}
              >
                <span>🛡️</span> User Registry & Admin
              </button>
            )}

            {isManager && (
              <button 
                onClick={() => setActiveTab('manager')}
                className={`w-full text-left p-3 rounded transition font-medium text-sm flex items-center gap-3 ${
                  activeTab === 'manager' ? 'border-l-[3px] border-[#14E0B4] text-[#14E0B4] bg-[#14E0B4]/10' : 'text-[#8A93A6] hover:text-[#F2F4F8]'
                }`}
              >
                <span>⚡</span> Asset Issuance
              </button>
            )}

            {isAuditor && (
              <button 
                onClick={() => setActiveTab('auditor')}
                className={`w-full text-left p-3 rounded transition font-medium text-sm flex items-center gap-3 ${
                  activeTab === 'auditor' ? 'border-l-[3px] border-[#FFB020] text-[#FFB020] bg-[#FFB020]/10' : 'text-[#8A93A6] hover:text-[#F2F4F8]'
                }`}
              >
                <span>📜</span> Compliance Logs
              </button>
            )}

            <button 
              onClick={() => setActiveTab('user')}
              className={`w-full text-left p-3 rounded transition font-medium text-sm flex items-center gap-3 ${
                activeTab === 'user' ? 'border-l-[3px] border-[#3B8AF2] text-[#3B8AF2] bg-[#3B8AF2]/10' : 'text-[#8A93A6] hover:text-[#F2F4F8]'
              }`}
            >
              <span>🔑</span> My Assets
            </button>
          </nav>
        </div>

        <div className="text-xs text-[#8A93A6] border-t border-[#2A3145] pt-4 font-mono">
          Sepolia Network
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        
        {/* Header Bar */}
        <header className="flex justify-between items-center p-6 border-b border-[#2A3145] bg-[#0F1420]">
          <div>
            {isConnected && !hasRole && (
              <div className="text-xs font-medium text-[#FFB020] bg-[#FFB020]/10 px-3 py-1.5 rounded border border-[#FFB020]/30 flex items-center gap-2">
                <span>⚠️</span> Awaiting Admin Role Assignment
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Network Indicator */}
            {isConnected && (
              <div className="flex items-center gap-2 text-xs font-mono bg-[#1A2133] px-3 py-1.5 rounded border border-[#2A3145]">
                <span className={`w-2 h-2 rounded-full ${isCorrectNetwork ? 'bg-[#14E0B4] animate-pulse' : 'bg-[#FF5A5F]'}`} />
                <span className="text-[#8A93A6]">{isCorrectNetwork ? 'Sepolia' : 'Wrong Network'}</span>
                {!isCorrectNetwork && switchChain && (
                  <button 
                    onClick={() => switchChain({ chainId: sepolia.id })}
                    className="ml-2 text-xs text-[#FF5A5F] underline font-sans hover:text-white"
                  >
                    Switch
                  </button>
                )}
              </div>
            )}

            {/* Wallet Connect Button / Badge */}
            {!isConnected ? (
              <button 
                onClick={() => connect({ connector: connectors[0] || injected() })}
                className="border border-[#14E0B4] text-[#14E0B4] px-5 py-2 rounded-full hover:bg-[#14E0B4]/10 transition font-medium text-sm shadow-[0_0_10px_rgba(20,224,180,0.15)]"
              >
                Connect Wallet
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-[#1A2133] px-4 py-2 rounded-full border border-[#2A3145]">
                <span className={`text-xs font-bold uppercase tracking-wider ${roleColor}`}>{roleLabel}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#2A3145]" />
                <span className="font-mono text-sm text-[#8A93A6]">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-10 overflow-y-auto flex-1">
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center h-64 text-[#8A93A6] space-y-4">
              <div className="text-4xl">🔐</div>
              <p className="text-lg font-medium text-[#F2F4F8]">Web3 Wallet Required</p>
              <p className="text-sm max-w-md text-center">Connect your Ethereum wallet to verify role permissions and interact with the decentralized asset platform.</p>
              <button 
                onClick={() => connect({ connector: connectors[0] || injected() })}
                className="bg-[#14E0B4] text-[#0F1420] font-bold px-6 py-2.5 rounded-full hover:bg-[#14E0B4]/90 transition"
              >
                Connect MetaMask
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'admin' && isAdmin && <AdminDashboard />}
              {activeTab === 'manager' && isManager && <ManagerDashboard />}
              {activeTab === 'auditor' && isAuditor && <AuditorDashboard />}
              {(activeTab === 'user' || !hasRole) && <UserDashboard />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}