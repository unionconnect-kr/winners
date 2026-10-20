package kr.co.manee.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ManeeReportFilesPlugin.class);
        registerPlugin(ManeePlayBillingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
