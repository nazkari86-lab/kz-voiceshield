module.exports = {
  project: {
    android: {
      packageName: 'kz.voiceshield',
      sourceDir: './android',
    },
  },
  dependencies: {
    'react-native-permissions': {
      platforms: {
        android: null,
      },
    },
  },
}
