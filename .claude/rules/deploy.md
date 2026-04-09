# Deploy & Pipelines

## Repositórios

- **Source:** `djalmajr/asciimark` (privado)
- **Public:** `djalmajr/asciimark-releases` (distribuição pública: releases + GitHub Pages)

## Pipelines

### Desktop App (`build-desktop.yml`)

**Trigger:** push de tags `v*` ou `workflow_dispatch`

**Fluxo:**
1. Build multiplataforma (macOS arm64/x64, Ubuntu, Windows) com signing
2. Upload de artefatos (instaladores + arquivos de update + signatures)
3. Gera `release-notes.md` a partir dos commits (conventional commits)
4. Normaliza nomes dos assets, gera `latest.json` (auto-update) e publica
   no repo público com `release-notes.md` como descrição

**Para fazer release:**
```bash
bun run bump:app <version>          # 0.6.0 ou 0.6.0-rc.0
git add -u && git commit -m "chore: bump version to <version>"
git tag v<version>
git push origin main --tags         # Tag dispara a pipeline
```

`bump:app` aceita também **prereleases**: `0.6.0-rc.0`, `1.2.3-beta.1`, etc.

**Arquivos de versão (devem estar em sync com a tag):**
- `apps/desktop/package.json` → `"version"`
- `apps/desktop/src-tauri/tauri.conf.json` → `"version"`
- `apps/desktop/src-tauri/Cargo.toml` → `version`
- `apps/desktop/src-tauri/Cargo.lock` → atualizado automaticamente por
  `cargo check` após o bump (incluir no commit)

## Auto-update (Tauri Updater Plugin)

O app desktop tem auto-update habilitado via `tauri-plugin-updater`. Cada
release publicado automaticamente via `build-desktop.yml` é detectado pelos
clientes instalados na próxima inicialização.

### Como funciona

1. App boota → 3s depois chama `check()` silencioso (não interrompe)
2. Se há versão nova → dialog modal nativo "Update available" com release
   notes resumidas e botões "Install and restart" / "Later"
3. User aceita → `downloadAndInstall()` → `relaunch()` automático
4. Item manual "Check for updates" no menu (☰) da toolbar pra checagem
   sob demanda

Implementação: `apps/desktop/src/lib/updater.ts` (`checkForAppUpdates(silent)`).
Wirado em `apps/desktop/src/app.tsx` no `onMount` (startup) e via prop
`onCheckForUpdates` que chega na `Toolbar` pelo `AppShell`.

### Endpoint

```
https://github.com/djalmajr/asciimark-releases/releases/latest/download/latest.json
```

O `latest.json` é gerado pelo step "Normalize assets and generate latest.json"
do `build-desktop.yml` e contém:
- `version`, `notes` (release notes), `pub_date`
- `platforms` map: `darwin-aarch64`, `darwin-x86_64`, `linux-x86_64`,
  `windows-x86_64`. Cada um com `signature` (conteúdo do `.sig`) e `url`
  apontando pro asset de update no release.

### Formatos de update por plataforma

O plugin updater **não** baixa o instalador normal. Ele baixa formatos
específicos que o `tauri build` gera quando `bundle.createUpdaterArtifacts:
true` está ligado em `tauri.conf.json`:

| Plataforma      | Asset de update             | Instalador (1ª instalação) |
|-----------------|-----------------------------|----------------------------|
| macOS arm64     | `*.app.tar.gz`              | `*.dmg`                    |
| macOS x64       | `*.app.tar.gz`              | `*.dmg`                    |
| Linux x64       | `*.AppImage.tar.gz`         | `*.AppImage` ou `*.deb`    |
| Windows x64     | `*.nsis.zip`                | `*.msi` ou `*-setup.exe`   |

Cada asset de update tem um `.sig` ao lado (assinatura ed25519) — sem
isso o updater rejeita o download.

### Signing keys

O Tauri usa `minisign` (ed25519) pra assinar os artefatos de update. **A
private key fica na máquina do mantenedor + GitHub secrets. Public key
fica no `tauri.conf.json` (commitada).**

**Localização da private key (mantenedor):**
- `~/.tauri/asciimark.key` (private — NUNCA commitar)
- `~/.tauri/asciimark.key.pub` (pública — vai pro tauri.conf.json)

**Geração (one-time):**
```bash
bun x @tauri-apps/cli signer generate -w ~/.tauri/asciimark.key
```

**🚨 BACKUP OBRIGATÓRIO** da `~/.tauri/asciimark.key` em pelo menos 2
locais offline. Se a private key for perdida:
- Clientes antigos **NUNCA** mais conseguem auto-update (verificação de
  signature falha permanentemente)
- A solução é publicar versão nova com pubkey diferente, mas usuários
  precisarão baixar o instalador manualmente uma vez (igual primeira
  instalação)

**Pubkey no `tauri.conf.json`:**
```jsonc
"plugins": {
  "updater": {
    "active": true,
    "dialog": false,
    "endpoints": ["https://github.com/.../latest/download/latest.json"],
    "pubkey": "<conteúdo do .pub base64-encoded>"
  }
}
```

### Build local com signing

Necessário pra testar o updater antes de releasear, e pra qualquer build
local (`bundle.createUpdaterArtifacts: true` exige as envs):

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/asciimark.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<senha>"
bun run build:app
```

Output esperado em `apps/desktop/src-tauri/target/release/bundle/macos/`:
- `AsciiMark.app`
- `AsciiMark.app.tar.gz` + `AsciiMark.app.tar.gz.sig`
- `AsciiMark_<version>_aarch64.dmg`

### Site (`deploy-site.yml`)

**Trigger:** push em `main` com mudanças em `apps/site/**`, `packages/ui/src/components/ui/**` ou `packages/core/src/**`, ou `workflow_dispatch`

**Fluxo:** Build → copia `index.html` como `404.html` (SPA fallback) → deploy para GitHub Pages no repo público

**Deploy é automático** ao mergear em `main` com mudanças nos paths acima.

## Secrets (GitHub Actions, repo `djalmajr/asciimark`)

- **`PUBLIC_DIST_TOKEN`**: PAT com write access ao repo
  `djalmajr/asciimark-releases`. Usado por ambas as pipelines pra criar
  releases e fazer upload de assets.
- **`TAURI_SIGNING_PRIVATE_KEY`**: conteúdo COMPLETO do
  `~/.tauri/asciimark.key` (incluindo as linhas `untrusted comment:`).
  Usado pelo `tauri build` na pipeline pra gerar `.sig` files.
- **`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`**: a senha definida no
  `signer generate`.

Os 3 são lidos automaticamente pela `build-desktop.yml`. Sem os 2 últimos
o build falha (porque `bundle.createUpdaterArtifacts: true` exige as
envs) ou os `.sig` ficam ausentes e o `latest.json` sai vazio.

**Setar via gh CLI** (mais seguro que UI pra a private key — passa via
stdin do arquivo, conteúdo nunca aparece no terminal):

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY \
  --repo djalmajr/asciimark \
  < ~/.tauri/asciimark.key

gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD \
  --repo djalmajr/asciimark
# (vai pedir o valor interativamente)
```

## Regras

- **Nunca** disparar pipelines manualmente sem pedir confirmação ao usuário
- **Nunca** criar/modificar tags sem pedir confirmação
- **Nunca** modificar workflows sem pedir confirmação
- **Nunca** alterar a `pubkey` no `tauri.conf.json` sem entender o impacto
  (clientes antigos param de receber updates se a key mudar)
- **Nunca** ler ou armazenar a private key (`~/.tauri/asciimark.key`) em
  ferramentas/IA
- Antes de release desktop: garantir versão em sync via `bun run bump:app <version>`
- Antes de release extension: garantir versão em sync via `bun run bump:ext <version>`
- **Nunca** editar arquivos de versão manualmente — sempre usar os scripts de bump

## Troubleshooting

### Pipeline rodou mas o `latest.json` está vazio (sem `platforms`)

As envs de signing não foram lidas em algum runner — o `tauri build` não
gerou `.sig` files. Verificar:
1. `gh secret list --repo djalmajr/asciimark` mostra os 3 secrets
2. O step "Build Tauri app" tem `env:` com as 2 envs `TAURI_SIGNING_*`
3. Logs do build em cada plataforma mencionam "Signing updater bundle"

### Auto-update não funciona após release

1. `curl https://github.com/djalmajr/asciimark-releases/releases/latest/download/latest.json | jq`
   — JSON deve ter 4 plataformas com `signature` não-vazio
2. A versão do `latest.json` precisa ser **maior** que a versão instalada
   (semver)
3. A `pubkey` no client tem que bater com a private key que assinou — se
   foi rotacionada, clientes antigos param de funcionar

### Erro "Failed to check for updates" no app

Pode ser:
- Endpoint retorna 404 (release não tem `latest.json` — pipeline falhou)
- `pubkey` no `tauri.conf.json` está incorreta ou vazia
- Cliente sem internet
- Cliente em versão de dev (sem versão semver válida)
