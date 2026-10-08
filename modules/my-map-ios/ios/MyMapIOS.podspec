Pod::Spec.new do |s|
  s.name = 'MyMapIOS'
  s.version = '1.0.0'
  s.summary = 'MyMap iOS travel, media export and sharing bridges'
  s.author = 'MyMap'
  s.homepage = 'https://github.com/pnhl/MyMap-IOS'
  s.license = { :type => 'MIT' }
  s.platforms = { :ios => '16.0' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CoreMotion', 'UIKit', 'ImageIO'
  s.source_files = '**/*.swift'
end
