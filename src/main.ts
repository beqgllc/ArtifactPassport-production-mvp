import QRCode from 'qrcode';
import { inspectArtifact } from './core/validate';
import { downloadPassport, passportMetadataPayload } from './core/passport';
import { fetchRemoteCiphertext, fetchRemoteMetadata, decryptHandoff, uploadEncryptedHandoff, parseShareRoute, shareUrl } from './core/share';
import type { ArtifactPassport, CheckResult } from './core/types';
import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

const shareApi = import.meta.env.VITE_SHARE_API_BASE_URL?.trim() || '';
const checkoutUrl = import.meta.env.VITE_PRO_CHECKOUT_URL?.trim() || '';

let selectedFile: File | null = null;
let currentPassport: ArtifactPassport | null = null;
let licenseSession = localStorage.getItem('artifactpassport_license_session') || '';
let licenseInstance = localStorage.getItem('artifactpassport_license_instance') || '';

renderShell();

const route = parseShareRoute(location.hash);
if (route) {
  renderShareRoute(route.token, route.key);
}

window.addEventListener('hashchange', () => {
  const next = parseShareRoute(location.hash);
  if (next) renderShareRoute(next.token, next.key);
  else renderShell();
});

function renderShell(): void {
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#/" aria-label="ArtifactPassport home">Artifact<span>Passport</span></a>
      <nav>
        <a href="#how">How it works</a>
        <a href="#pricing">Pricing</a>
      </nav>
    </header>
    <main>
      <section class="hero">
        <div class="eyebrow">LOCAL-FIRST · AI ARTIFACT QA</div>
        <h1>AI made the file.<br><span>ArtifactPassport tells you what you got.</span></h1>
        <p class="lede">Inspect, fingerprint, verify, and hand off AI-generated files without uploading them by default.</p>
      </section>

      <section class="drop-panel" aria-labelledby="drop-title">
        <div class="drop-copy">
          <p class="eyebrow">STEP 01</p>
          <h2 id="drop-title">Inspect an artifact</h2>
          <p>HTML, CSS, JavaScript, JSON, ZIP, and common binary files. Inspection stays in this browser until you explicitly start a cloud handoff.</p>
        </div>
        <label class="dropzone" id="dropzone" tabindex="0">
          <input id="fileInput" type="file" hidden />
          <span class="drop-icon">↥</span>
          <strong>Drop a file here</strong>
          <span>or tap to choose a file · 25 MiB local limit</span>
        </label>
        <div id="selection" class="selection" hidden></div>
      </section>

      <section id="reportSection" class="report-section" hidden></section>

      <section id="how" class="info-grid">
        <article><div class="number">01</div><h3>Fingerprint</h3><p>A SHA-256 digest gives the exact artifact a stable identity without storing its contents.</p></article>
        <article><div class="number">02</div><h3>Validate</h3><p>Deterministic checks catch broken references, syntax errors, missing mobile metadata, and obvious secret patterns.</p></article>
        <article><div class="number">03</div><h3>Handoff</h3><p>Optional end-to-end encrypted sharing creates a short-lived QR link. The decryption key lives only in the URL fragment.</p></article>
      </section>

      <section id="pricing" class="pricing">
        <div><p class="eyebrow">EARLY PRODUCT</p><h2>Start free. Pay when you need cloud handoff.</h2><p>Local inspection is free. Pro unlocks encrypted cross-device handoff. Put the hosted checkout URL in <code>VITE_PRO_CHECKOUT_URL</code> when you are ready to sell.</p></div>
        <div class="price-card"><strong>Founder License</strong><span class="price">$19.99</span><p>One-time purchase. Unlimited local inspection plus encrypted QR handoff and future Pro features.</p><button id="buyButton" class="button primary" ${checkoutUrl ? '' : 'disabled'}>${checkoutUrl ? 'Get founder license' : 'Configure checkout first'}</button><label class="license-label" for="licenseKey">License key</label><input id="licenseKey" class="license-input" placeholder="Paste your license key" autocomplete="off"/><button id="activateLicense" class="button secondary" ${shareApi ? '' : 'disabled'}>${shareApi ? 'Activate Pro' : 'Configure API first'}</button><div id="licenseStatus" class="license-status">${licenseSession ? 'Checking license…' : 'No active license in this browser.'}</div></div>
      </section>
    </main>
    <footer>ArtifactPassport v0.1 · Local-first by default · No files uploaded during inspection</footer>
  `;

  bindShellEvents();
  void restoreLicenseState();
}

function bindShellEvents(): void {
  const input = document.querySelector<HTMLInputElement>('#fileInput');
  const dropzone = document.querySelector<HTMLLabelElement>('#dropzone');
  const selection = document.querySelector<HTMLDivElement>('#selection');
  const buyButton = document.querySelector<HTMLButtonElement>('#buyButton');
  if (!input || !dropzone || !selection) return;

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) handleFile(file);
  });
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  });
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('dragging');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragging');
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });
  buyButton?.addEventListener('click', () => window.open(checkoutUrl, '_blank', 'noopener,noreferrer'));
  document.querySelector<HTMLButtonElement>('#activateLicense')?.addEventListener('click', activateProLicense);
}

async function handleFile(file: File): Promise<void> {
  selectedFile = file;
  currentPassport = null;
  const selection = document.querySelector<HTMLDivElement>('#selection');
  if (selection) {
    selection.hidden = false;
    selection.innerHTML = `<strong>${escapeHtml(file.name)}</strong><span>${formatBytes(file.size)} · ${escapeHtml(file.type || 'unknown MIME type')}</span><span class="spinner">Inspecting…</span>`;
  }

  const section = document.querySelector<HTMLElement>('#reportSection');
  if (!section) return;
  section.hidden = false;
  section.innerHTML = `<div class="empty-state">Running deterministic inspection locally…</div>`;

  try {
    currentPassport = await inspectArtifact(file);
    section.innerHTML = renderReport(currentPassport);
    await renderQr(currentPassport);
    bindReportEvents();
  } catch (err) {
    section.innerHTML = `<div class="alert error"><strong>Inspection failed.</strong><span>${escapeHtml(err instanceof Error ? err.message : String(err))}</span></div>`;
  }
}

function renderReport(passport: ArtifactPassport): string {
  const statusClass = passport.summary.status;
  return `
    <div class="report-head">
      <div><p class="eyebrow">ARTIFACT PASSPORT</p><h2>${escapeHtml(passport.artifact.filename)}</h2><p class="mono">${escapeHtml(passport.artifactId)} · ${escapeHtml(passport.artifact.sha256)}</p></div>
      <div class="status ${statusClass}">${passport.summary.status.toUpperCase()}</div>
    </div>
    <div class="metrics">
      <div><span>Files</span><strong>${passport.summary.files}</strong></div>
      <div><span>Passed</span><strong>${passport.summary.passed}</strong></div>
      <div><span>Warnings</span><strong>${passport.summary.warnings}</strong></div>
      <div><span>Errors</span><strong>${passport.summary.errors}</strong></div>
    </div>
    <div class="report-grid">
      <div class="checks"><h3>Checks</h3>${renderChecks(passport.checks)}</div>
      <aside class="passport-card"><div class="passport-title">Passport</div><dl>
        <dt>SHA-256</dt><dd class="mono wrap">${escapeHtml(passport.artifact.sha256)}</dd>
        <dt>Created</dt><dd>${escapeHtml(new Date(passport.artifact.createdAt).toLocaleString())}</dd>
        <dt>Engine</dt><dd>${escapeHtml(passport.engineVersion)}</dd>
        <dt>Security</dt><dd>${passport.security.secretMatches ? `${passport.security.secretMatches} potential secret match(es)` : 'No supported patterns detected'}</dd>
      </dl><div class="qr-wrap"><canvas id="qrCanvas" aria-label="Artifact Passport QR code"></canvas><span>Metadata-only QR until cloud sharing is enabled.</span></div></aside>
    </div>
    <div class="actions"><button id="downloadPassport" class="button primary">Export passport JSON</button><button id="shareButton" class="button secondary" ${shareApi ? '' : 'disabled'}>${shareApi ? 'Create encrypted QR handoff' : 'Cloud handoff not configured'}</button><button id="copyMetadata" class="button secondary">Copy fingerprint</button></div>
    <p class="small-note">The passport identifies the exact bytes you inspected. It is not a malware scanner, and a “verified” status does not mean the artifact is safe to execute.</p>
  `;
}

function renderChecks(checks: CheckResult[]): string {
  return checks.slice(0, 80).map((check) => `<div class="check"><span class="dot ${check.severity}"></span><div><strong>${escapeHtml(check.label)}</strong><p>${escapeHtml(check.detail)}</p></div></div>`).join('');
}

async function renderQr(passport: ArtifactPassport): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#qrCanvas');
  if (!canvas) return;
  const payload = passportMetadataPayload(passport);
  await QRCode.toCanvas(canvas, payload, { width: 180, margin: 2, errorCorrectionLevel: 'M' });
}

function bindReportEvents(): void {
  document.querySelector<HTMLButtonElement>('#downloadPassport')?.addEventListener('click', () => {
    if (currentPassport) downloadPassport(currentPassport);
  });
  document.querySelector<HTMLButtonElement>('#copyMetadata')?.addEventListener('click', async () => {
    if (!currentPassport) return;
    await navigator.clipboard.writeText(`${currentPassport.artifactId}\n${currentPassport.artifact.sha256}`);
    toast('Fingerprint copied.');
  });
  document.querySelector<HTMLButtonElement>('#shareButton')?.addEventListener('click', createEncryptedShare);
}

async function activateProLicense(): Promise<void> {
  if (!shareApi) return;
  const input = document.querySelector<HTMLInputElement>('#licenseKey');
  const status = document.querySelector<HTMLDivElement>('#licenseStatus');
  const licenseKey = input?.value.trim() || '';
  if (!licenseKey) { toast('Enter your Lemon Squeezy license key first.'); return; }
  if (status) status.textContent = 'Activating…';
  try {
    const response = await fetch(`${shareApi.replace(/\/$/, '')}/api/license/activate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ licenseKey, instanceName: `web-${crypto.randomUUID().slice(0, 8)}` }),
    });
    const data = await response.json() as { token?: string; instanceId?: string; error?: string };
    if (!response.ok || !data.token) throw new Error(data.error || 'License activation failed.');
    licenseSession = data.token;
    licenseInstance = data.instanceId || '';
    localStorage.setItem('artifactpassport_license_session', licenseSession);
    localStorage.setItem('artifactpassport_license_instance', licenseInstance);
    if (status) status.textContent = 'Pro license active in this browser.';
    toast('Pro license activated.');
  } catch (err) {
    if (status) status.textContent = 'License activation failed.';
    toast(err instanceof Error ? err.message : 'License activation failed.');
  }
}

async function restoreLicenseState(): Promise<void> {
  const status = document.querySelector<HTMLDivElement>('#licenseStatus');
  if (!status) return;
  if (!licenseSession || !shareApi) { status.textContent = shareApi ? 'No active license in this browser.' : 'Cloud sharing is not configured.'; return; }
  try {
    const response = await fetch(`${shareApi.replace(/\/$/, '')}/api/license/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: licenseSession }) });
    const data = await response.json() as { valid?: boolean; error?: string };
    if (!response.ok || !data.valid) { licenseSession = ''; licenseInstance = ''; localStorage.removeItem('artifactpassport_license_session'); localStorage.removeItem('artifactpassport_license_instance'); status.textContent = data.error || 'License is not active.'; return; }
    status.textContent = 'Pro license active in this browser.';
  } catch {
    status.textContent = 'License status could not be checked; try again before cloud handoff.';
  }
}

async function createEncryptedShare(): Promise<void> {
  if (!selectedFile || !currentPassport || !shareApi) return;
  if (!licenseSession) { toast('Encrypted handoff requires an active Pro license.'); document.querySelector('#pricing')?.scrollIntoView({ behavior: 'smooth' }); return; }
  const button = document.querySelector<HTMLButtonElement>('#shareButton');
  if (button) {
    button.disabled = true;
    button.textContent = 'Encrypting + uploading…';
  }
  try {
   const result = await uploadEncryptedHandoff(shareApi,selectedFile,currentPassport,licenseSession);
    const url = shareUrl(location.origin, result.share.token, result.key);
    location.href = url;
    toast('Encrypted handoff created.');
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Share failed.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Create encrypted QR handoff';
    }
  }
}

async function renderShareRoute(token: string, key: Uint8Array): Promise<void> {
  app.innerHTML = `<main class="share-page"><div class="eyebrow">ENCRYPTED HANDOFF</div><h1>Retrieving artifact…</h1><p class="lede">The decryption key stays in this URL fragment and is never sent to the server.</p><div class="empty-state">Loading passport metadata…</div></main>`;
  try {
    const endpoint = shareApi;
    if (!endpoint) throw new Error('This deployment has no share API configured.');
    const metadata = await fetchRemoteMetadata(endpoint, token);
    const ciphertext = await fetchRemoteCiphertext(endpoint, token);
    const plaintext = await decryptHandoff(ciphertext, base64Url(metadata.iv), key);
    const plaintextBuffer = new ArrayBuffer(plaintext.byteLength);
    new Uint8Array(plaintextBuffer).set(plaintext);
    const hash = await crypto.subtle.digest('SHA-256', plaintextBuffer);
    const actualHash = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const intact = actualHash === metadata.sha256;
    app.innerHTML = `
      <main class="share-page">
        <a class="brand" href="#/">Artifact<span>Passport</span></a>
        <div class="eyebrow">VERIFIED HANDOFF</div><h1>${escapeHtml(metadata.filename)}</h1>
        <div class="status ${intact ? 'verified' : 'error'}">${intact ? 'INTEGRITY MATCH' : 'INTEGRITY FAILED'}</div>
        <div class="share-card"><div><span>Passport ID</span><strong class="mono">${escapeHtml(metadata.passport.artifactId)}</strong></div><div><span>Expires</span><strong>${escapeHtml(new Date(metadata.expiresAt).toLocaleString())}</strong></div><div><span>SHA-256</span><strong class="mono wrap">${escapeHtml(actualHash)}</strong></div></div>
        <div class="share-qr"><canvas id="shareQrCanvas" aria-label="Encrypted ArtifactPassport handoff QR code"></canvas><p>Scan this code on another device to open the same encrypted handoff.</p></div>
        <button id="downloadShared" class="button primary" ${intact ? '' : 'disabled'}>Download verified artifact</button>
        <button id="downloadSharedPassport" class="button secondary">Download passport</button>
        <button id="copyShareLink" class="button secondary">Copy handoff link</button>
      </main>`;
    const shareLink = location.href;
    const shareQrCanvas = document.querySelector<HTMLCanvasElement>('#shareQrCanvas');
    if (shareQrCanvas) await QRCode.toCanvas(shareQrCanvas, shareLink, { width: 220, margin: 2, errorCorrectionLevel: 'M' });
    document.querySelector<HTMLButtonElement>('#downloadShared')?.addEventListener('click', () => downloadBytes(plaintext, metadata.filename, metadata.mime));
    document.querySelector<HTMLButtonElement>('#downloadSharedPassport')?.addEventListener('click', () => downloadPassport(metadata.passport));
    document.querySelector<HTMLButtonElement>('#copyShareLink')?.addEventListener('click', async () => { await navigator.clipboard.writeText(shareLink); toast('Handoff link copied.'); });
  } catch (err) {
    app.innerHTML = `<main class="share-page"><a class="brand" href="#/">Artifact<span>Passport</span></a><div class="alert error"><strong>Handoff unavailable</strong><span>${escapeHtml(err instanceof Error ? err.message : String(err))}</span></div></main>`;
  }
}

function base64Url(value: string): Uint8Array { return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), (char) => char.charCodeAt(0)); }

function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  const bytesBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(bytesBuffer).set(bytes);
  const blob = new Blob([bytesBuffer], {type: mime || 'application/octet-stream',
});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toast(message: string): void {
  const existing = document.querySelector('.toast');
  existing?.remove();
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3000);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char));
}
