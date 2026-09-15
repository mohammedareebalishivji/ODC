import { useEffect, useRef, useState } from 'react';
import { Volume2, Square } from 'lucide-react';
import { useI18n } from '../i18n';

/**
 * Voice guide — the "आवाज़ मार्गदर्शक / Listen" control from the designs.
 *
 * Uses the browser's built-in speech synthesis, so it needs no backend and no
 * third-party service. It reads the current screen's instruction in whichever
 * language is active. If the device has no voice for that language the button
 * hides itself rather than reading Hindi text with an English voice, which is
 * unintelligible.
 */
export default function VoiceGuide({ text, rate = 0.85, className = '' }) {
  const { t, lang } = useI18n();
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const utteranceRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;

    const check = () => {
      const wanted = lang === 'hi' ? 'hi' : 'en';
      const voices = window.speechSynthesis.getVoices();
      setSupported(voices.some((v) => v.lang.toLowerCase().startsWith(wanted)));
    };

    check();
    // Voices load asynchronously in most browsers.
    window.speechSynthesis.addEventListener('voiceschanged', check);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', check);
  }, [lang]);

  // Never leave speech running when the screen goes away.
  useEffect(() => () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  function stop() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  function speak() {
    if (speaking) {
      stop();
      return;
    }
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    const wanted = lang === 'hi' ? 'hi' : 'en';
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang.toLowerCase().startsWith(wanted));
    if (voice) u.voice = voice;
    u.lang = voice?.lang || (lang === 'hi' ? 'hi-IN' : 'en-IN');
    u.rate = rate;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);

    utteranceRef.current = u;
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }

  if (!supported || !text) return null;

  return (
    <button
      type="button"
      className={`voice-guide ${speaking ? 'on' : ''} ${className}`}
      onClick={speak}
      aria-pressed={speaking}
    >
      {speaking ? <Square size={14} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}
      <span>{speaking ? t('common.close') : t('common.listen')}</span>
      <span className="voice-guide-tag">{t('common.voiceGuide')}</span>
    </button>
  );
}
