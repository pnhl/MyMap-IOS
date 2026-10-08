Pod::Spec.new do |s|
  s.name             = 'MyMapGameCenter'
  s.version          = '1.0.0'
  s.summary          = 'Game Center authentication bridge for MyMap'
  s.description      = 'Signs an Apple Game Center player into the shared Firebase Authentication session.'
  s.author           = 'MyMap'
  s.homepage         = 'https://docs.expo.dev/modules/'
  s.platforms        = { :ios => '15.1' }
  s.source           = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'Firebase/Auth'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.frameworks = 'GameKit'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
