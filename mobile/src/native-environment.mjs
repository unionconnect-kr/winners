const environments={staging:{projectRef:'obpkzecgswnfuyhwvncd',scheme:'kr.co.manee.app.staging'},production:{projectRef:'bhwuuxcrzxespkjlmqxr',scheme:'kr.co.manee.app'}};
export function nativeSocialScheme(config){
 const expected=environments[config?.environment];
 if(!expected||config.projectRef!==expected.projectRef||config.supabaseUrl!==`https://${expected.projectRef}.supabase.co`)throw Error('Unexpected native authentication environment');
 return expected.scheme;
}
export function iosUrlSchemePlist(source,environment){
 const expected=environments[environment];if(!expected)throw Error('Unknown iOS environment');
 const values=source.match(/<string>kr\.co\.manee\.app(?:\.staging)?<\/string>/g)||[];
 if(values.length!==2||!source.includes('<key>CFBundleURLSchemes</key>'))throw Error('Unexpected iOS URL configuration');
 return source.replaceAll(/<string>kr\.co\.manee\.app(?:\.staging)?<\/string>/g,`<string>${expected.scheme}</string>`);
}
