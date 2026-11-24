package kr.co.manee.app;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ManeeAppUpdate")
public class ManeeAppUpdatePlugin extends Plugin {
    @PluginMethod
    public void openStore(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=kr.co.manee.app"));
                intent.setPackage("com.android.vending");
                getActivity().startActivity(intent);
                call.resolve();
            } catch (Exception missingPlay) {
                try {
                    getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=kr.co.manee.app")));
                    call.resolve();
                } catch (Exception unavailable) { call.reject("스토어를 열지 못했어요."); }
            }
        });
    }
}
