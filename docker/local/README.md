# Local demo runtime

This is the isolated clone-and-run profile. Docker Engine/Desktop with Compose
v2 and internet access for the first build/image/proof-parameter downloads are
required. No MetaMask, Sepolia funds, Preview faucet, Java or Node installation
on the host is required.

From the repository root:

```sh
docker compose up --build -d
docker compose logs -f app
```

Open <http://localhost:5173>. Initial builds and proof setup take time; health
and proof readiness are separate. The page reports progress while the local
wallet, contract and fictional provider are prepared.

If port 5173 is occupied, use the same override for Compose commands:

```sh
MIDPROOF_WEB_PORT=25173 docker compose up --build -d
```

Then open <http://localhost:25173>. A second independent instance also needs a
different Compose project name, for example `-p midproof-second`.

## What runs

- Vue is served by nginx. `/api` and `/midnight-proof` proxy to this local app;
  the browser does not fall back to the hosted demo API.
- One app image contains Spring, gateway, mock attestation, result reader and
  the actual native Midnight Proof Server 8.1.0.
- MySQL starts with a CREATE-only schema in a new named volume. Synthetic demo
  users are created through the existing normal signup API.
- Anvil 1.8.3 runs local chain 31337. A one-time helper compiles and deploys the
  existing Solidity contracts, generates local synthetic actor keys, and
  creates/verifies/tokenizes a 1,000/900 mKRW fixture. It does not insert fake
  lifecycle history into MySQL or use existing Sepolia keys.
- Midnight Node 1.0.0 and Indexer 4.3.3 run network `undeployed`. Its public
  development genesis wallet supplies local proof transaction fees. That wallet
  is forbidden outside the explicit local profile.

The actual Compact circuit, Provider signature, proof generation, local-chain
submission and independent Indexer verification remain real. The companies,
institution and financial inputs are fictional. A local result is not a
Preview transaction or real-world financial verification.

## State and shutdown

```sh
docker compose stop
docker compose start
```

Normal stop/start preserves MySQL, Anvil history, Midnight chain, Indexer,
generated local role keys and encrypted proof/wallet state in this Compose
project's named volumes. `docker compose down` removes containers/network but
retains volumes; `docker compose up -d` recreates them with the same state.
Do not remove one volume independently: contract, wallet and database identities
must stay consistent. A deliberate `docker compose down --volumes` erases this
local demo completely; it is not a recovery step.

All host ports bind to `127.0.0.1`; only the browser port is published. Keys and
state live in Docker volumes, never in the repository or the built image.
No existing GASOK database, local state directory or Railway volume is mounted.
The root Dockerfile's default target remains the hosted application; only
Compose selects its `local-demo` target.

Anvil is pinned to the [official Foundry 1.8.3 release](https://github.com/foundry-rs/foundry/releases/tag/v1.8.3)
and its downloaded image digest. The existing application dependency pins and
Solidity source are unchanged.
