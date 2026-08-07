// Self-controlled testnet USDC issuer setup for a real on-chain pay flow.
// 1. create issuer, fund via friendbot
// 2. deployer establishes trustline to ISSUER:USDC
// 3. issuer mints USDC to deployer
import {
  Keypair,
  Networks,
  Horizon,
  TransactionBuilder,
  Operation,
  Asset,
  BASE_FEE,
} from '@stellar/stellar-sdk';

const HORIZON = 'https://horizon-testnet.stellar.org';
const PASS = Networks.TESTNET;
const server = new Horizon.Server(HORIZON);

const DEPLOYER_SECRET = 'SDL4SWRGFBZ5XBB5EORL3BHLUSETFBVVQ6OIESURFR7D4BFQQJKMJI3P';
const deployer = Keypair.fromSecret(DEPLOYER_SECRET);

async function friendbot(pub) {
  const r = await fetch(`https://friendbot.stellar.org/?addr=${pub}`);
  if (!r.ok && r.status !== 400) throw new Error('friendbot failed ' + r.status);
  return r.status;
}

async function submit(tx) {
  try {
    const res = await server.submitTransaction(tx);
    return res.hash;
  } catch (e) {
    const codes = e?.response?.data?.extras?.result_codes;
    throw new Error('submit failed: ' + JSON.stringify(codes || e.message));
  }
}

const issuer = Keypair.random();
console.log('ISSUER_PUB=' + issuer.publicKey());
console.log('ISSUER_SECRET=' + issuer.secret());
console.log('DEPLOYER_PUB=' + deployer.publicKey());

// fund issuer
const fb = await friendbot(issuer.publicKey());
console.log('friendbot issuer status=' + fb);
// ensure deployer funded (already ~10000 XLM, but harmless)
await friendbot(deployer.publicKey()).catch(() => {});

const USDC = new Asset('USDC', issuer.publicKey());

// trustline from deployer
const depAcct = await server.loadAccount(deployer.publicKey());
const trustTx = new TransactionBuilder(depAcct, { fee: BASE_FEE, networkPassphrase: PASS })
  .addOperation(Operation.changeTrust({ asset: USDC, limit: '1000000' }))
  .setTimeout(120)
  .build();
trustTx.sign(deployer);
const trustHash = await submit(trustTx);
console.log('TRUSTLINE_TX=' + trustHash);

// issuer mints 1000 USDC to deployer
const issAcct = await server.loadAccount(issuer.publicKey());
const mintTx = new TransactionBuilder(issAcct, { fee: BASE_FEE, networkPassphrase: PASS })
  .addOperation(Operation.payment({ destination: deployer.publicKey(), asset: USDC, amount: '1000' }))
  .setTimeout(120)
  .build();
mintTx.sign(issuer);
const mintHash = await submit(mintTx);
console.log('MINT_TX=' + mintHash);

// verify balance
const after = await server.loadAccount(deployer.publicKey());
const bal = after.balances.find((b) => b.asset_code === 'USDC' && b.asset_issuer === issuer.publicKey());
console.log('DEPLOYER_USDC_BALANCE=' + (bal ? bal.balance : 'NONE'));
console.log('DONE');
