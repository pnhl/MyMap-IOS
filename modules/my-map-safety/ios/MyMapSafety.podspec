Pod::Spec.new do |s|
  s.name             = 'MyMapSafety'
  s.version          = '1.0.0'
  s.summary          = 'Native motion incident detection for MyMap'
  s.description      = 'Bridges Core Motion incident candidates to the MyMap React Native application.'
  s.author           = 'MyMap'
  s.homepage         = 'https://docs.expo.dev/modules/'
  s.platforms        = { :ios => '15.1' }
  s.source           = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.frameworks = 'CoreMotion', 'CoreLocation', 'WatchConnectivity', 'Photos', 'BackgroundTasks'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
