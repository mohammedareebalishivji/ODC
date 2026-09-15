import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { kyc } from '../apiEndpoints';
import { Button, Card, Pill, toast } from '../ui';

/**
 * Role-Based Onboarding & Verification — the worker-facing KYC screen.
 * Aadhaar / PAN / FSSAI upload with the verification badge state from the
 * Stitch onboarding design.
 */

const DOC_TYPES = [
  { value: 'aadhaar', labelKey: 'kyc.aadhaar', needsNumber: true, placeholder: '12-digit Aadhaar' },
  { value: 'pan', labelKey: null, label: 'PAN', needsNumber: true, placeholder: 'ABCDE1234F' },
  { value: 'fssai', labelKey: null, label: 'FSSAI food handler', needsNumber: false },
  { value: 'digilocker', labelKey: 'kyc.digilocker', needsNumber: false },
];

// Keep uploads comfortably under the server's 500 KB guard.
const MAX_BYTES = 500 * 1024;

export default function Verification() {
  const { t } = useI18n();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState('aadhaar');
  const [number, setNumber] = useState('');
  const [fileData, setFileData] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await kyc.mine();
      setDocs(r.documents || []);
    } catch (err) {
      toast(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const active = DOC_TYPES.find((d) => d.value === docType);

  function pickFile(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(t('toast.fileTooLarge'));
      ev.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFileData(String(reader.result || ''));
      setFileName(file.name);
      setError('');
    };
    reader.onerror = () => setError(t('common.error'));
    reader.readAsDataURL(file);
  }

  async function submit(ev) {
    ev.preventDefault();
    setBusy(true);
    setError('');
    try {
      await kyc.submit({
        docType,
        ...(active?.needsNumber ? { number } : {}),
        ...(fileData ? { fileData } : {}),
      });
      setNumber('');
      setFileData('');
      setFileName('');
      toast(t('kyc.pending'));
      await load();
    } catch (err) {
      setError(err.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  const toneFor = (status) =>
    status === 'verified' ? 'green' : status === 'rejected' ? 'red' : 'amber';

  return (
    <div className="pay-wrap">
      <header className="pay-head">
        <h1 className="pay-title">{t('kyc.title')}</h1>
      </header>

      <Card className="kyc-form-card">
        <form onSubmit={submit}>
          <label className="field">
            <span className="field-label">{t('kyc.upload')}</span>
            <select
              className="input select"
              value={docType}
              onChange={(e) => { setDocType(e.target.value); setNumber(''); }}
            >
              {DOC_TYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.labelKey ? t(d.labelKey) : d.label}
                </option>
              ))}
            </select>
          </label>

          {active?.needsNumber && (
            <label className="field">
              <span className="field-label">
                {active.value === 'aadhaar' ? t('kyc.aadhaarNumber') : 'PAN'}
              </span>
              <input
                className="input"
                value={number}
                onChange={(e) => setNumber(e.target.value.toUpperCase())}
                placeholder={active.placeholder}
                inputMode={active.value === 'aadhaar' ? 'numeric' : 'text'}
                autoComplete="off"
              />
              <span className="field-hint">
                Only the last 4 digits are stored on our servers.
              </span>
            </label>
          )}

          <label className="field">
            <span className="field-label">{t('kyc.fileLabel')}</span>
            <input
              type="file"
              className="input"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={pickFile}
            />
            {fileName && <span className="field-hint">{fileName}</span>}
          </label>

          {error && <p className="field-error">{error}</p>}

          <Button type="submit" full disabled={busy}>
            {t('kyc.upload')}
          </Button>
        </form>
      </Card>

      <section className="pay-section" style={{ marginTop: 24 }}>
        <h2 className="pay-section-title">{t('kyc.title')}</h2>
        {loading ? (
          <div className="skeleton" style={{ height: 80 }} />
        ) : docs.length === 0 ? (
          <Card className="pay-empty">{t('kyc.pending')}</Card>
        ) : (
          <ul className="pay-list">
            {docs.map((d) => (
              <li key={d.id}>
                <Card className="pay-row">
                  <div className="pay-row-main">
                    <p className="pay-row-title">
                      {d.docType.toUpperCase()}
                      {d.numberLast4 ? ` •••• ${d.numberLast4}` : ''}
                    </p>
                    <p className="pay-row-sub">
                      {d.reviewNote || new Date(d.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Pill tone={toneFor(d.status)}>{d.status}</Pill>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
