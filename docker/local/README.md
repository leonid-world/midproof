# Local demo runtime

This is the isolated clone-and-run profile. Docker Engine/Desktop with Compose
v2 and internet access for the first build/image/proof-parameter downloads are
required. No MetaMask, GIWA wallet, receivable, test ETH, Preview faucet, Java or
Node installation on the host is required.

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
- The Midnight-only demo automatically prepares fictional proof scenarios and
  encrypted demo authentication state. It does not start an EVM, deploy Solidity,
  create a receivable or fetch GIWA funds. Existing GIWA contract sources remain
  in the repository for the separate application flow.
- Midnight Node 1.0.0 and Indexer 4.3.3 run network `undeployed`. Its public
  development genesis wallet supplies local proof transaction fees. That wallet
  is forbidden outside the explicit local profile.

The actual Compact circuit, Provider signature, proof generation, local-chain
submission and independent Indexer verification remain real. The companies,
institution and financial inputs are fictional. The preserved circuit's GIWA
binding fields are unused synthetic metadata in this mode, not a deployed
Finance contract or verified receivable. GIWA RPC points at an unavailable
loopback endpoint so an accidental fallback cannot contact Sepolia. A local
result is not a Preview transaction or real-world financial verification.

## State and shutdown

```sh
docker compose stop
docker compose up -d
```

Normal stop/start preserves MySQL, Midnight chain, Indexer and encrypted
proof/wallet/demo authentication state in this Compose project's four named
volumes. `docker compose down` removes containers/network but
retains volumes; `docker compose up -d` recreates them with the same state.
Do not remove one volume independently: contract, wallet and database identities
must stay consistent. A deliberate `docker compose down --volumes` erases this
local demo completely; it is not a recovery step.

All host ports bind to `127.0.0.1`; only the browser port is published. Keys and
state live in Docker volumes, never in the repository or the built image.
No existing GASOK database, local state directory or Railway volume is mounted.
The root Dockerfile's default target remains the hosted application; only
Compose selects its `local-demo` target.

The default project name is now `midproof-midnight`. The earlier seven-service
`midproof-local` profile used a different contract binding; its volumes are
preserved and must not be reused with this profile. Use the new default name or
a new `-p` name. Existing application dependency pins and Solidity source are
unchanged.
