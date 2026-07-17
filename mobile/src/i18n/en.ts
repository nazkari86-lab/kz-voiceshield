import type { I18nKeys } from './ru'

export const en: I18nKeys = {
  app: { name: 'KZ VoiceShield', tagline: 'Fraud protection' },
  nav: { live: 'Shield', scan: 'Scan', learn: 'Learn', cases: 'Cases', more: 'More' },
  live: {
    active: 'PROTECTION ACTIVE', standby: 'STANDBY MODE', start: 'Start protection', stop: 'Stop',
    saveCase: 'Save case', shareReport: 'Report', transcript: 'LIVE TRANSCRIPT',
    waitAudio: 'WAITING FOR AUDIO', hearsAudio: 'MICROPHONE HEARS AUDIO', pauseTitle: 'Take a 30-second pause',
    pauseCopy: 'End the call. Do not share codes or approve payments.', startPause: 'Start pause', restartPause: 'Restart pause',
    endCall: 'End call', noCaptionTitle: 'No caption text?', noCaptionCopy: 'Turn on speakerphone and use the microphone',
    sharedData: 'I shared data', recoveryPlan: 'Immediate recovery plan', practice: 'Practice',
    practiceDesc: 'Learn fraud patterns', doNow: 'Do this now', pauseActive: 'Pause active:',
  },
  risk: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' },
  setup: {
    title: 'Setup', theme: 'Appearance', themeAuto: 'Auto', themeLight: 'Light', themeDark: 'Dark',
    language: 'Language', download: 'Download model', deleteAll: 'Delete all data', confirmDelete: 'Confirm delete', cancel: 'Cancel',
  },
  llm: { title: 'VoiceShield AI', notLoaded: 'AI model is not loaded', loadModel: 'Load model' },
  sms: { title: 'SMS scanner', scan: 'Scan' },
  history: { title: 'Call history', clear: 'Clear', empty: 'No saved calls' },
  stats: { title: 'Statistics' },
  voip: {
    eyebrow: 'PROTECTED CALLING',
    title: 'Protected VoIP call',
    description: 'A direct in-app audio call through a temporary LiveKit room. Server secrets stay on your Mac or backend.',
    ready: 'Ready for a protected call',
    readyCopy: 'Create a temporary room and share its Call ID. Both participants need a configured VoiceShield server to connect.',
    create: 'Create call', creating: 'Creating room…', callId: 'Call ID', callIdPlaceholder: 'Enter a Call ID to join', join: 'Join call',
    joining: 'Joining…', connected: 'Call connected', connecting: 'Connecting to protected room…', participants: 'Participants in call', waiting: 'Waiting for the other participant. Share the Call ID.',
    participantConnected: 'Participant connected. Audio is sent directly through LiveKit.', microphoneOn: 'Microphone on', microphoneOff: 'Microphone off', audioOutput: 'Audio output', refreshAudio: 'Refresh audio devices', audioUnavailable: 'Audio devices are not ready yet. Refresh after the room connects.',
    shareCallId: 'Share Call ID', ending: 'Ending call…', end: 'End call', analysisBoundary: 'Live Shield runs separately and does not create a synthetic call transcript.',
    errorNetwork: 'The server cannot be reached. Check the URL, Wi-Fi network, and backend status.', errorAuthorization: 'The server rejected access. Check the API token in Setup.', errorUnavailable: 'Voice service is unavailable because LiveKit is not configured on the server.', errorNotFound: 'The room was not found or has already ended.',
    errorFallback: 'Could not connect to the protected call.', errorAudioOutput: 'Could not switch the audio output.', errorAudioDevices: 'Could not read available audio devices.', errorMicrophone: 'Microphone unavailable',
  },
}
