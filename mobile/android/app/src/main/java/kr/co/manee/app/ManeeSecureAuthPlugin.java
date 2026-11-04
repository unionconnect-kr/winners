package kr.co.manee.app;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name="ManeeSecureAuth")
public class ManeeSecureAuthPlugin extends Plugin {
    private ManeeSecureAuthStore store;
    @Override public void load(){store=new ManeeSecureAuthStore(getContext(),"manee_secure_auth_v1");}
    @PluginMethod public void get(PluginCall call){
        try{String value=store.get(call.getString("key"));JSObject result=new JSObject();result.put("value",value==null?JSONObject.NULL:value);call.resolve(result);}
        catch(Exception e){call.reject("Secure auth storage unavailable");}
    }
    @PluginMethod public void set(PluginCall call){
        try{store.set(call.getString("key"),call.getString("value"));call.resolve();}
        catch(Exception e){call.reject("Secure auth storage unavailable");}
    }
    @PluginMethod public void remove(PluginCall call){
        try{store.remove(call.getString("key"));call.resolve();}
        catch(Exception e){call.reject("Secure auth storage unavailable");}
    }
}
