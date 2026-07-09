module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        alias: {
          '@': './src',
          '@bridge': './src/bridge',
          '@hooks': './src/hooks',
          '@screens': './src/screens',
          '@scoring': './src/scoring',
        },
      },
    ],
  ],
}
