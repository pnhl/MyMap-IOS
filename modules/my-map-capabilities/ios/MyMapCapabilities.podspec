Pod::Spec.new do |s|
  s.name = 'MyMapCapabilities'
  s.version = '1.0.0'
  s.summary = 'MyMap device authentication, vault, signing and speech'
  s.description = s.summary
  s.author = 'MyMap'
  s.homepage = 'https://mymap.app'
  s.license = { :type => 'MIT' }
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Speech', 'AVFoundation', 'LocalAuthentication', 'Security', 'Vision', 'ImageIO'
  s.source_files = '**/*.{h,m,mm,swift}'
end
