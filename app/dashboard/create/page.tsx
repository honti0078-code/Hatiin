'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { StrKey } from '@stellar/stellar-sdk';
import { Users, Plus, Trash2, ArrowLeft, SplitSquareVertical, Check } from 'lucide-react';
import { ConnectWallet } from '@/ui/components/ConnectWallet';
import { EnableUsdc } from '@/ui/components/EnableUsdc';
import { useSession } from '@/ui/hooks/useSession';

type Participant = { publicKey: string; displayName: string };

function usdcToMinor(usdc: string): string {
  const num = parseFloat(usdc);
  if (Number.isNaN(num) || num <= 0) return '0';
  return Math.round(num * 1_000_000).toString();
}

function isValidStellarAddress(v: string): boolean {
  return v.length === 56 && StrKey.isValidEd25519PublicKey(v);
}

export default function CreateBillPage() {
  const router = useRouter();
  const { session } = useSession();
  const connected = !!session.publicKey;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creatorAddress, setCreatorAddress] = useState('');
  const [creatorTouched, setCreatorTouched] = useState(false);
  const [totalUsdc, setTotalUsdc] = useState('');
  // Settlement asset for the bill. Native XLM (no trustline — works for any
  // funded wallet) or USDC (needs a trustline). Defaults to XLM so every bill
  // works out of the box; USDC is opt-in.
  const [billAsset, setBillAsset] = useState<'usdc' | 'xlm'>('xlm');
  const [participants, setParticipants] = useState<Participant[]>([
    { publicKey: '', displayName: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // If a wallet is connected, auto-fill the receiving address with the session
  // key (until the user edits it). Connection stays optional — the field is
  // always editable and never required to be a connected wallet.
  useEffect(() => {
    if (session.publicKey && !creatorTouched) {
      setCreatorAddress(session.publicKey);
    }
  }, [session.publicKey, creatorTouched]);

  // The address that will actually receive payments: the typed value, falling
  // back to the connected session key so connected users never have to touch it.
  const receivingAddress = (creatorAddress.trim() || session.publicKey || '').trim();

  const addParticipant = () => {
    setParticipants((p) => [...p, { publicKey: '', displayName: '' }]);
  };

  const removeParticipant = (i: number) => {
    setParticipants((p) => p.filter((_, idx) => idx !== i));
  };

  const updateParticipant = (i: number, field: keyof Participant, value: string) => {
    setParticipants((p) => p.map((par, idx) => (idx === i ? { ...par, [field]: value } : par)));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = 'Title is required';
    // Validate format only when an address is typed. Emptiness is enforced by the
    // server, which falls back to a connected session cookie if present — this
    // avoids a race where the session key has not loaded yet for connected users.
    if (receivingAddress && !isValidStellarAddress(receivingAddress)) {
      newErrors.creator = 'Invalid Stellar address (must be a valid G... key)';
    }
    const amount = parseFloat(totalUsdc);
    if (Number.isNaN(amount) || amount <= 0) newErrors.totalUsdc = 'Enter a valid amount';
    participants.forEach((p, i) => {
      if (!p.displayName.trim()) newErrors[`name_${i}`] = 'Name required';
      if (!isValidStellarAddress(p.publicKey.trim())) newErrors[`pk_${i}`] = 'Invalid Stellar address (G...)';
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          // Omit when empty so the server can fall back to the session cookie
          // (connected users). Anonymous users must supply a valid address.
          creatorPublicKey: receivingAddress || undefined,
          totalAmountMinor: usdcToMinor(totalUsdc),
          asset: billAsset,
          participants: participants.map((p) => ({
            publicKey: p.publicKey.trim(),
            displayName: p.displayName.trim(),
          })),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        router.push(`/bills/${data.data.bill.id}`);
      } else {
        setErrors({ submit: data.error?.message ?? 'Failed to create bill' });
      }
    } catch {
      setErrors({ submit: 'Network error. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const totalAmount = parseFloat(totalUsdc) || 0;
  const sharePerPerson = participants.length > 0 ? totalAmount / participants.length : 0;
  const assetLabel = billAsset === 'xlm' ? 'XLM' : 'USDC';

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50">
      {/* Navbar */}
      <nav className="border-b border-amber-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/dashboard" className="text-amber-600 hover:text-amber-800 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2 font-bold text-xl text-amber-600">
            <Users className="h-6 w-6" />
            <span className="font-[var(--font-heading)]">Hatiin</span>
          </div>
          <div className="ml-auto">
            <ConnectWallet />
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 font-[var(--font-heading)]">
            Create a Bill
          </h1>
          <p className="text-gray-600 mt-1">
            Split costs equally among participants. No wallet required — just type
            the Stellar address where you want to get paid.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Bill details */}
          <div className="bg-white rounded-xl border border-amber-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 font-[var(--font-heading)]">Bill Details</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Your receiving address (G...) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={creatorAddress}
                onChange={(e) => {
                  setCreatorTouched(true);
                  setCreatorAddress(e.target.value);
                }}
                placeholder="Your Stellar address where you get paid (G...)"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
              {connected && receivingAddress === session.publicKey && !creatorTouched ? (
                <p className="text-amber-600 text-xs mt-1 font-medium flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" /> Auto-filled from your connected wallet — edit if you want a different address.
                </p>
              ) : (
                <p className="text-gray-400 text-xs mt-1">
                  Participants send their share here. Connecting a wallet is optional.
                </p>
              )}
              {errors.creator && <p className="text-red-500 text-xs mt-1">{errors.creator}</p>}
            </div>

            {/* Settlement asset: the whole bill is denominated in this asset.
                XLM (native) needs no trustline; USDC does. */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Settlement asset <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBillAsset('xlm')}
                  className={`rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                    billAsset === 'xlm'
                      ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-gray-200 text-gray-600 hover:border-amber-300'
                  }`}
                >
                  XLM
                  <span className="block text-[11px] font-normal text-gray-400">
                    Native · no trustline · default
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setBillAsset('usdc')}
                  className={`rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                    billAsset === 'usdc'
                      ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-gray-200 text-gray-600 hover:border-amber-300'
                  }`}
                >
                  USDC
                  <span className="block text-[11px] font-normal text-gray-400">
                    Stablecoin · needs trustline
                  </span>
                </button>
              </div>
            </div>

            {/* Helper: enable USDC (trustline) on the receiving wallet so it can
                actually receive USDC payments. Only relevant for USDC bills. */}
            {billAsset === 'usdc' && <EnableUsdc />}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Bill title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Team lunch"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Description (optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Friday team lunch"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Total amount ({assetLabel}) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
                  {assetLabel}
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={totalUsdc}
                  onChange={(e) => setTotalUsdc(e.target.value)}
                  placeholder="35.00"
                  className="w-full pl-14 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>
              {errors.totalUsdc && <p className="text-red-500 text-xs mt-1">{errors.totalUsdc}</p>}
              {sharePerPerson > 0 && (
                <p className="text-amber-600 text-xs mt-1 font-medium">
                  ≈ {sharePerPerson.toFixed(2)} {assetLabel} per person
                </p>
              )}
            </div>
          </div>

          {/* Participants */}
          <div className="bg-white rounded-xl border border-amber-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 font-[var(--font-heading)]">
                Participants ({participants.length})
              </h2>
              <button
                type="button"
                onClick={addParticipant}
                className="text-amber-600 hover:text-amber-800 text-sm font-medium flex items-center gap-1 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add person
              </button>
            </div>

            <div className="space-y-4">
              {participants.map((p, i) => (
                <div key={i} className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-amber-700">Person {i + 1}</span>
                    {participants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeParticipant(i)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={p.displayName}
                      onChange={(e) => updateParticipant(i, 'displayName', e.target.value)}
                      placeholder="Display name"
                      className="w-full px-3 py-2 rounded-lg border border-amber-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                    />
                    {errors[`name_${i}`] && (
                      <p className="text-red-500 text-xs">{errors[`name_${i}`]}</p>
                    )}
                    <input
                      type="text"
                      value={p.publicKey}
                      onChange={(e) => updateParticipant(i, 'publicKey', e.target.value)}
                      placeholder="Stellar wallet address (G...)"
                      className="w-full px-3 py-2 rounded-lg border border-amber-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent font-mono"
                    />
                    {errors[`pk_${i}`] && (
                      <p className="text-red-500 text-xs">{errors[`pk_${i}`]}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {errors.submit}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-amber-500 text-white font-semibold py-3 px-6 rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 text-base"
          >
            <SplitSquareVertical className="h-5 w-5" />
            {submitting ? 'Creating...' : 'Create Bill'}
          </button>
        </form>
      </main>
    </div>
  );
}
