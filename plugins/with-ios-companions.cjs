const {withInfoPlist,withEntitlementsPlist,withXcodeProject}=require('expo/config-plugins');
const fs=require('node:fs'),path=require('node:path');
module.exports=(config,{carPlay=false,watch=false}={})=>{
  if(carPlay){
    config=withEntitlementsPlist(config,c=>{c.modResults['com.apple.developer.carplay-maps']=true;return c;});
    config=withInfoPlist(config,c=>{
      c.modResults.UIApplicationSceneManifest={
        UIApplicationSupportsMultipleScenes:true,
        UISceneConfigurations:{CPTemplateApplicationSceneSessionRoleApplication:[{
          UISceneClassName:'CPTemplateApplicationScene',UISceneConfigurationName:'MyMap CarPlay',
          UISceneDelegateClassName:'MyMapIOS.MyMapCarPlaySceneDelegate',
        }]},
      };return c;
    });
  }
  if(watch)config=withXcodeProject(config,c=>{
    const project=c.modResults,name='MyMapWatch';
    const directory=path.join(c.modRequest.platformProjectRoot,name);
    fs.mkdirSync(directory,{recursive:true});
    fs.copyFileSync(path.join(c.modRequest.projectRoot,'companions/watch/MyMapWatchApp.swift'),path.join(directory,'MyMapWatchApp.swift'));
    if(project.pbxTargetByName(name))return c;
    const target=project.addTarget(name,'watch2_app',name,`${config.ios.bundleIdentifier}.watchkitapp`);
    // Modern single-target watchOS SwiftUI app (watchOS 9+).
    target.pbxNativeTarget.productType='"com.apple.product-type.application"';
    const objects=project.pbxXCBuildConfigurationSection();
    const ids=project.pbxXCConfigurationList()[target.pbxNativeTarget.buildConfigurationList].buildConfigurations.map(x=>x.value);
    for(const id of ids)Object.assign(objects[id].buildSettings,{
      PRODUCT_NAME:'"$(TARGET_NAME)"',PRODUCT_BUNDLE_IDENTIFIER:`"${config.ios.bundleIdentifier}.watchkitapp"`,
      SDKROOT:'watchos',SUPPORTED_PLATFORMS:'"watchos watchsimulator"',WATCHOS_DEPLOYMENT_TARGET:'9.0',
      TARGETED_DEVICE_FAMILY:'4',SWIFT_VERSION:'5.0',GENERATE_INFOPLIST_FILE:'YES',
      INFOPLIST_KEY_WKApplication:'YES',INFOPLIST_KEY_WKCompanionAppBundleIdentifier:`"${config.ios.bundleIdentifier}"`,
      INFOPLIST_KEY_CFBundleDisplayName:'MyMap',MARKETING_VERSION:config.version,CURRENT_PROJECT_VERSION:config.ios.buildNumber,
      SKIP_INSTALL:'YES',ASSETCATALOG_COMPILER_APPICON_NAME:'',INFOPLIST_FILE:'',
    });
    const group=project.addPbxGroup(['MyMapWatchApp.swift'],name,name);
    project.addToPbxGroup(group.uuid,project.getFirstProject().firstProject.mainGroup);
    project.addBuildPhase([name+'/MyMapWatchApp.swift'],'PBXSourcesBuildPhase','Sources',target.uuid);
    project.addBuildPhase([],'PBXFrameworksBuildPhase','Frameworks',target.uuid);
    project.addBuildPhase([],'PBXResourcesBuildPhase','Resources',target.uuid);
    return c;
  });
  return config;
};
