Pod::Spec.new do |s|
  s.name           = 'LockedApps'
  s.version        = '1.0.0'
  s.summary        = 'Shows and edits the apps picked for Screen Time locking'
  s.description    = 'Renders Apple Screen Time labels (icon + name) for picked app tokens.'
  s.author         = ''
  s.homepage       = 'https://github.com/hwanify/pushupapp'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'FamilyControls', 'ManagedSettings', 'SwiftUI'
  s.source_files   = '**/*.swift'
end
