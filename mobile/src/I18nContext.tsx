import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ru } from './i18n/ru'
import { kz } from './i18n/kz'
import { en } from './i18n/en'

export type Language = 'ru' | 'kz' | 'en'
const strings = { ru, kz, en }

type I18nContextValue = {
  t: typeof ru
  lang: Language
  setLang: (lang: Language) => void
}

const I18nContext = createContext<I18nContextValue>({ t: ru, lang: 'ru', setLang: () => undefined })

const LANG_KEY = 'voiceshield.language.v1'

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('ru')

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY).then(v => {
      if (v === 'ru' || v === 'kz' || v === 'en') setLangState(v)
    }).catch(() => undefined)
  }, [])

  const setLang = useCallback((next: Language) => {
    setLangState(next)
    void AsyncStorage.setItem(LANG_KEY, next)
  }, [])

  return (
    <I18nContext.Provider value={{ t: strings[lang], lang, setLang }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}
