/**
 * Server-side client for the SplitEscrow Soroban contract — the on-chain core
 * of Hatiin's split-the-bill flow.
 *
 * Two signing models, both real on-chain:
 *
 *  1. ADMIN-signed (server holds the deployer/admin secret): `openBill`,
 *     `cancelBill`. Opening a bill moves no funds, so the backend can do it on
 *     a creator's behalf (a creator only types a receiving address).
 *
 *  2. PAYER-signed (Freighter): `buildPayShare` returns an unsigned XDR the
 *     browser signs; `submit` then submits the signed XDR via Soroban RPC. The
 *     participant's own funds move into the contract; no secret touches the
 *     server for a contribution.
 */
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';

export interface SplitEscrowConfig {
  rpcUrl: string;
  contractId: string;
  networkPassphrase: string;
}

/** Deep-convert simulation/return values to a JSON-safe shape. */
function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of value) out[String(k)] = jsonSafe(v);
    return out;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = jsonSafe(v);
    return out;
  }
  return value;
}

export class SplitEscrowClient {
  private readonly server: rpc.Server;
  private readonly contract: Contract;
  private readonly networkPassphrase: string;

  constructor(config: SplitEscrowConfig) {
    this.server = new rpc.Server(config.rpcUrl, {
      allowHttp: config.rpcUrl.startsWith('http://'),
    });
    this.contract = new Contract(config.contractId);
    this.networkPassphrase = config.networkPassphrase;
  }

  /** Build + simulate + assemble an invoke tx, returning unsigned XDR. */
  private async buildInvoke(source: string, method: string, args: xdr.ScVal[]): Promise<string> {
    const account = await this.server.getAccount(source);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      // Generous bound: the user signs in Freighter between build and submit.
      .setTimeout(300)
      .build();
    const prepared = await this.server.prepareTransaction(tx);
    return prepared.toXDR();
  }

  /** Submit a signed XDR and poll until applied. Returns the tx hash + result. */
  async submit(signedXdr: string): Promise<{ txHash: string; result: unknown }> {
    const tx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);
    const sent = await this.server.sendTransaction(tx);
    if (sent.status === 'ERROR') {
      throw new Error(`Soroban submit failed: ${JSON.stringify(sent.errorResult)}`);
    }
    let got = await this.server.getTransaction(sent.hash);
    const deadline = Date.now() + 45_000;
    while (got.status === 'NOT_FOUND' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      got = await this.server.getTransaction(sent.hash);
    }
    if (got.status === 'FAILED') {
      throw new Error(`Soroban tx ${sent.hash} failed: ${JSON.stringify(got)}`);
    }
    const result =
      got.status === 'SUCCESS' && got.returnValue
        ? jsonSafe(scValToNative(got.returnValue))
        : null;
    return { txHash: sent.hash, result };
  }

  /**
   * Build, sign with the admin secret, and submit in one shot (server-side).
   * The admin/deployer key is shared across projects, so a sequence collision
   * (`TxBadSeq`) is retried with fresh sequence + small jittered backoff.
   */
  private async invokeSigned(
    adminSecret: string,
    method: string,
    args: xdr.ScVal[],
  ): Promise<{ txHash: string; result: unknown }> {
    const kp = Keypair.fromSecret(adminSecret);
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const account = await this.server.getAccount(kp.publicKey());
        const tx = new TransactionBuilder(account, {
          fee: (Number(BASE_FEE) * 100).toString(),
          networkPassphrase: this.networkPassphrase,
        })
          .addOperation(this.contract.call(method, ...args))
          .setTimeout(120)
          .build();
        const prepared = await this.server.prepareTransaction(tx);
        prepared.sign(kp);
        return await this.submit(prepared.toXDR());
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (!/badseq|bad_seq|tx_bad_seq/i.test(msg)) throw err;
        await new Promise((r) => setTimeout(r, 800 + Math.floor(Math.random() * 1200)));
      }
    }
    throw lastErr;
  }

  // --- Admin-signed (server) --------------------------------------------

  /**
   * Open a bill on-chain. Returns the contract bill id + tx hash.
   * @param adminSecret deployer/admin secret (server-only)
   */
  async openBill(
    adminSecret: string,
    args: { creator: string; totalAmount: bigint | string; numShares: number; deadline: number },
  ): Promise<{ contractBillId: number; txHash: string }> {
    const scArgs: xdr.ScVal[] = [
      new Address(args.creator).toScVal(),
      nativeToScVal(BigInt(args.totalAmount), { type: 'i128' }),
      nativeToScVal(args.numShares, { type: 'u32' }),
      nativeToScVal(BigInt(args.deadline), { type: 'u64' }),
    ];
    const { txHash, result } = await this.invokeSigned(adminSecret, 'open_bill', scArgs);
    return { contractBillId: Number(result), txHash };
  }

  async cancelBill(adminSecret: string, contractBillId: number): Promise<{ txHash: string }> {
    const scArgs = [nativeToScVal(contractBillId, { type: 'u32' })];
    const { txHash } = await this.invokeSigned(adminSecret, 'cancel', scArgs);
    return { txHash };
  }

  // --- Payer-signed (Freighter) -----------------------------------------

  /** Build an unsigned `pay_share` invoke for the participant to sign. */
  buildPayShare(args: {
    contractBillId: number;
    payer: string;
    amount: bigint | string;
  }): Promise<string> {
    const scArgs: xdr.ScVal[] = [
      nativeToScVal(args.contractBillId, { type: 'u32' }),
      new Address(args.payer).toScVal(),
      nativeToScVal(BigInt(args.amount), { type: 'i128' }),
    ];
    return this.buildInvoke(args.payer, 'pay_share', scArgs);
  }

  /** Build an unsigned `refund` invoke for the contributor to sign. */
  buildRefund(args: { contractBillId: number; payer: string }): Promise<string> {
    const scArgs: xdr.ScVal[] = [
      nativeToScVal(args.contractBillId, { type: 'u32' }),
      new Address(args.payer).toScVal(),
    ];
    return this.buildInvoke(args.payer, 'refund', scArgs);
  }

  // --- Views (read-only simulation, no fees, no signature) ---------------

  async getBill(contractBillId: number): Promise<unknown> {
    return this.simulateView('get_bill', [nativeToScVal(contractBillId, { type: 'u32' })]);
  }

  async totalBills(): Promise<number> {
    const r = await this.simulateView('total_bills', []);
    return Number(r ?? 0);
  }

  private async simulateView(method: string, args: xdr.ScVal[]): Promise<unknown> {
    const account = new Account(Keypair.random().publicKey(), '0');
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(60)
      .build();
    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw new Error(`simulate ${method} failed: ${sim.error}`);
    }
    const retval = sim.result?.retval;
    return retval ? jsonSafe(scValToNative(retval)) : null;
  }
}
