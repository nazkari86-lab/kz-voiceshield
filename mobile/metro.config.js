const path = require('path')
const exclusionList = require('metro-config/src/defaults/exclusionList')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

const root = __dirname

module.exports = mergeConfig(getDefaultConfig(root), {
  resolver: {
    alias: {
      '@': path.resolve(root, 'src'),
      '@bridge': path.resolve(root, 'src/bridge'),
      '@hooks': path.resolve(root, 'src/hooks'),
      '@screens': path.resolve(root, 'src/screens'),
      '@scoring': path.resolve(root, 'src/scoring.ts'),
    },
    blockList: exclusionList([
      /android\/app\/src\/main\/cpp\/whisper\.cpp\/.*/,
      /android\/build\/.*/,
      /android\/app\/build\/.*/,
    ]),
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
})
