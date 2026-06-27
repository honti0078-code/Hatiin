import Link from 'next/link';
import { CheckCircle, Clock, Users, Zap, SplitSquareVertical, ArrowRight } from 'lucide-react';
import { ConnectWallet } from '@/ui/components/ConnectWallet';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50">
      {/* Navbar */}
      <nav className="border-b border-amber-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-amber-600">
            <Users className="h-6 w-6 text-amber-600" />
            <span className="font-[var(--font-heading)]">Hatiin</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-amber-700 font-medium hover:text-amber-900 transition-colors hidden sm:inline"
            >
              My Bills
            </Link>
            <Link
              href="/stats"
              className="text-sm text-amber-700 font-medium hover:text-amber-900 transition-colors hidden sm:inline"
            >
              Stats
            </Link>
            <ConnectWallet />
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
          <Zap className="h-4 w-4" />
          Built on Stellar — settle in XLM or USDC instantly
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 font-[var(--font-heading)] mb-6 leading-tight">
          Split bills with friends.{' '}
          <span className="text-amber-500">Settle on-chain</span>{' '}
          on Stellar.
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
          No more awkward money reminders. Everyone pays their exact share directly on-chain.
          Bill creator gets paid — instantly, transparently.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-3">
          <Link
            href="/dashboard/create"
            className="bg-amber-500 text-white font-semibold text-base h-12 px-8 rounded-lg hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
          >
            <SplitSquareVertical className="h-5 w-5" />
            Split a Bill Now
          </Link>
          <Link
            href="/dashboard"
            className="border-2 border-amber-500 text-amber-600 font-semibold text-base h-12 px-8 rounded-lg hover:bg-amber-50 transition-colors flex items-center justify-center gap-2"
          >
            View My Bills
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
        <p className="text-sm text-gray-500 mb-16">
          No wallet needed to start — just type your Stellar address. Connecting a wallet is optional.
        </p>

        {/* Demo preview card — illustrative sample, not live data */}
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="bg-amber-100 text-amber-700 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-0.5 rounded-full">
              Example
            </span>
            <span className="text-xs text-gray-400">Sample bill — illustrative only</span>
          </div>
          <div className="relative bg-white rounded-2xl border-2 border-dashed border-amber-200 p-6 shadow-sm text-left">
            <span className="absolute -top-2.5 right-4 bg-white px-2 text-[10px] font-semibold uppercase tracking-wider text-amber-500 border border-amber-200 rounded-full py-0.5">
              Sample
            </span>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-semibold text-gray-900 font-[var(--font-heading)]">Group dinner</div>
              <div className="text-sm text-gray-500">4 people · split equally</div>
            </div>
            <span className="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">
              ALL PAID
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
            <div className="bg-amber-500 h-2 rounded-full w-full" />
          </div>
          <div className="space-y-2">
            {['Person 1', 'Person 2', 'Person 3', 'Person 4'].map((name) => (
              <div key={name} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{name}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">equal share</span>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold font-[var(--font-heading)] text-gray-900 mb-2">
            How Hatiin works
          </h2>
          <p className="text-gray-600">Split fairly. Pay directly. Settle instantly.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white rounded-xl p-6 border border-amber-100 shadow-sm">
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-amber-600" />
            </div>
            <h3 className="font-semibold text-gray-900 font-[var(--font-heading)] mb-2">
              Create a group bill
            </h3>
            <p className="text-sm text-gray-600">
              Enter the total amount, add participants by name and Stellar wallet address. Shares are split equally.
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-amber-100 shadow-sm">
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center mb-4">
              <Zap className="h-6 w-6 text-amber-600" />
            </div>
            <h3 className="font-semibold text-gray-900 font-[var(--font-heading)] mb-2">
              Each person pays their share
            </h3>
            <p className="text-sm text-gray-600">
              Each participant scans a QR code and sends their exact share in XLM or USDC via any Stellar wallet. No app needed.
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-amber-100 shadow-sm">
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center mb-4">
              <CheckCircle className="h-6 w-6 text-amber-600" />
            </div>
            <h3 className="font-semibold text-gray-900 font-[var(--font-heading)] mb-2">
              Bill settles automatically
            </h3>
            <p className="text-sm text-gray-600">
              When the last person pays, the bill status updates to SETTLED instantly via Horizon SSE. Everyone sees it live.
            </p>
          </div>
        </div>
      </section>

      {/* Call to action */}
      <section className="max-w-6xl mx-auto px-4 py-16 bg-amber-50 rounded-2xl mx-4 mb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold font-[var(--font-heading)] text-gray-900 mb-2">
            Ready to split your next bill?
          </h2>
          <p className="text-gray-600 max-w-xl mx-auto">
            Create a bill in seconds — no wallet, no sign-up. Just type the Stellar address
            where you want to get paid and share the link. Everyone settles their share in XLM or USDC.
          </p>
        </div>
        <div className="flex justify-center">
          <Link
            href="/dashboard/create"
            className="bg-amber-500 text-white font-semibold px-6 py-3 rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-2"
          >
            <SplitSquareVertical className="h-5 w-5" />
            Create a Bill
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-500">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Users className="h-4 w-4 text-amber-500" />
            <span className="font-semibold text-amber-600">Hatiin</span>
          </div>
          <p>Built for the Stellar APAC Hackathon 2026 · Track C — Community &amp; Social</p>
          <p className="mt-1">Powered by Stellar · XLM &amp; USDC on Testnet</p>
          <p className="mt-2">
            <Link href="/stats" className="text-amber-600 hover:underline">
              View usage metrics
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
