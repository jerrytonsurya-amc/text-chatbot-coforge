import { useCallback, useEffect, useRef, useState } from 'react';

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function useSpeechToText({ onTranscript, onFinalTranscript, onError } = {}) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const baseTextRef = useRef('');
  const callbacksRef = useRef({ onTranscript, onFinalTranscript, onError });

  callbacksRef.current = { onTranscript, onFinalTranscript, onError };

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return undefined;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }

      const combined = `${baseTextRef.current}${finalText || interim}`.trimStart();
      callbacksRef.current.onTranscript?.(combined, Boolean(finalText));

      if (finalText) {
        const nextValue = `${baseTextRef.current}${finalText}`.replace(/\s+/g, ' ').trim();
        baseTextRef.current = nextValue ? `${nextValue} ` : '';
        callbacksRef.current.onFinalTranscript?.(nextValue);
      }
    };

    recognition.onerror = (event) => {
      setIsListening(false);

      if (event.error === 'aborted') return;

      const messages = {
        'not-allowed': 'Microphone access was denied. Allow mic permission in your browser settings.',
        'no-speech': 'No speech detected. Try again and speak clearly.',
        network: 'Voice input needs a network connection in this browser.',
        'audio-capture': 'No microphone found. Connect a mic and try again.',
      };

      callbacksRef.current.onError?.(messages[event.error] || 'Voice input failed. Please try again.');
    };

    recognitionRef.current = recognition;
    setIsSupported(true);

    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const startListening = useCallback(
    (currentText = '') => {
      const recognition = recognitionRef.current;
      if (!recognition || isListening) return;

      baseTextRef.current = currentText.trim() ? `${currentText.trim()} ` : '';

      try {
        recognition.start();
      } catch {
        callbacksRef.current.onError?.('Voice input is already active.');
      }
    },
    [isListening]
  );

  const toggleListening = useCallback(
    (currentText = '') => {
      if (isListening) {
        stopListening();
        return;
      }
      startListening(currentText);
    },
    [isListening, startListening, stopListening]
  );

  return {
    isSupported,
    isListening,
    startListening,
    stopListening,
    toggleListening,
  };
}
