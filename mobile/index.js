import { AppRegistry, LogBox } from 'react-native'
import { registerGlobals } from '@livekit/react-native'
import App from './src/App'
import { name as appName } from './app.json'

LogBox.ignoreLogs([
  'new NativeEventEmitter',
  'Sending `onAnimatedValueUpdate`',
  'Require cycle:',
  'ViewPropTypes will be removed',
])

registerGlobals()

AppRegistry.registerComponent(appName, () => App)
