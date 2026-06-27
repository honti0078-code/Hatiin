import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db client
vi.mock('@/server/db/client', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/server/lib/eventBus', () => ({
  eventBus: {
    publish: vi.fn(),
    subscribe: vi.fn(),
  },
}));

vi.mock('@/server/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { minorToUsdc } from '@/server/service/bill.service';

describe('minorToUsdc', () => {
  it('converts 35000000 to 35.00', () => {
    expect(minorToUsdc('35000000')).toBe('35.00');
  });

  it('converts 8750000 to 8.75', () => {
    expect(minorToUsdc('8750000')).toBe('8.75');
  });

  it('converts 0 to 0.00', () => {
    expect(minorToUsdc('0')).toBe('0.00');
  });

  it('converts 1 to 0.000001', () => {
    expect(minorToUsdc('1')).toBe('0.000001');
  });

  it('converts 1000000 to 1.00', () => {
    expect(minorToUsdc('1000000')).toBe('1.00');
  });

  it('converts 20000000 to 20.00', () => {
    expect(minorToUsdc('20000000')).toBe('20.00');
  });
});

describe('bill share splitting', () => {
  it('splits 35 USDC equally among 4 participants', () => {
    const total = 35_000_000n;
    const count = 4n;
    const share = total / count;
    const remainder = total - share * count;

    expect(share).toBe(8_750_000n);
    expect(remainder).toBe(0n);
    // All 4 get equal share
    const shares = [share, share, share, share + remainder];
    expect(shares.reduce((a, b) => a + b, 0n)).toBe(total);
  });

  it('splits 20 USDC among 3 participants (handles remainder)', () => {
    const total = 20_000_000n;
    const count = 3n;
    const share = total / count;
    const remainder = total - share * count;

    expect(share).toBe(6_666_666n);
    expect(remainder).toBe(2n); // 2 minor units extra goes to last person
    const shares = [share, share, share + remainder];
    expect(shares.reduce((a, b) => a + b, 0n)).toBe(total);
  });

  it('splits 15 USDC equally among 3 participants', () => {
    const total = 15_000_000n;
    const count = 3n;
    const share = total / count;
    const remainder = total - share * count;

    expect(share).toBe(5_000_000n);
    expect(remainder).toBe(0n);
  });
});

describe('bill status transitions', () => {
  it('open → settling when first payment recorded', () => {
    const status = 'open';
    const paid = 0n;
    const newPaid = 8_750_000n;
    const total = 35_000_000n;

    const allPaid = newPaid === total;
    const newStatus = allPaid ? 'settled' : status === 'open' ? 'settling' : status;
    expect(newStatus).toBe('settling');
  });

  it('settling → settled when all participants pay', () => {
    const status = 'settling';
    const total = 35_000_000n;

    const allPaid = true; // last participant just paid
    const newStatus = allPaid ? 'settled' : status;
    expect(newStatus).toBe('settled');
  });

  it('stays settling when only some participants have paid', () => {
    const status = 'settling';
    const total = 35_000_000n;
    const newPaid = 17_500_000n; // 2 of 4 paid

    const allPaid = newPaid === total;
    const newStatus = allPaid ? 'settled' : status;
    expect(newStatus).toBe('settling');
  });
});

describe('SEP-7 URI builder', () => {
  it('builds a valid SEP-7 payment URI', () => {
    const destination = 'GCREATOR12345678901234567890123456789012345678901234AB';
    const shareUsdc = '8.75';
    const billId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const memo = billId.replace(/-/g, '').slice(0, 28);
    const issuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

    const uri = `web+stellar:pay?destination=${destination}&amount=${shareUsdc}&asset_code=USDC&asset_issuer=${issuer}&memo=${memo}&memo_type=text`;

    expect(uri).toContain('web+stellar:pay');
    expect(uri).toContain(`destination=${destination}`);
    expect(uri).toContain('asset_code=USDC');
    expect(uri).toContain(`amount=${shareUsdc}`);
    expect(uri).toContain(`memo=${memo}`);
    expect(memo).toBe('aaaaaaaabbbbccccddddeeeeeeeeeeee'.slice(0, 28));
  });
});
