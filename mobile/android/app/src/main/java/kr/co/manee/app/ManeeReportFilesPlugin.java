package kr.co.manee.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.concurrent.atomic.AtomicBoolean;

/** Saves only a user-selected report through Android's system document picker. */
@CapacitorPlugin(name = "ManeeReportFiles")
public class ManeeReportFilesPlugin extends Plugin {
    private static final String PREFIX = "manee-report-";
    private static final int MAX_BYTES = 32 * 1024 * 1024;
    private final AtomicBoolean saving = new AtomicBoolean(false);

    @Override
    public void load() {
        // Remove abandoned private cache files, never files saved by the user.
        File[] files = getContext().getCacheDir().listFiles();
        if (files != null) for (File file : files) {
            if (file.getName().startsWith(PREFIX) && file.lastModified() < System.currentTimeMillis() - 86400000L) file.delete();
        }
    }

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data", "");
        String mime = call.getString("mimeType", "");
        String name = call.getString("filename", "");
        boolean pdf = "application/pdf".equals(mime);
        boolean excel = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".equals(mime);
        if ((!pdf && !excel) || !name.endsWith(pdf ? ".pdf" : ".xlsx") || data.isEmpty() || data.length() > ((MAX_BYTES + 2) / 3) * 4) {
            call.reject("Invalid report", "INVALID_REPORT");
            return;
        }
        if (!saving.compareAndSet(false, true)) {
            call.reject("A save is already in progress", "SAVE_BUSY");
            return;
        }
        File temp = null;
        try {
            byte[] bytes = Base64.decode(data, Base64.NO_WRAP);
            if (bytes.length == 0 || bytes.length > MAX_BYTES) throw new IOException("Invalid report size");
            temp = File.createTempFile(PREFIX, ".tmp", getContext().getCacheDir());
            try (OutputStream output = new FileOutputStream(temp)) { output.write(bytes); }
            // Android may persist the pending call during the picker. Keep large
            // base64 data out of the Activity state Bundle (TransactionTooLarge).
            call.getData().remove("data");
            call.getData().put("reportTempName", temp.getName());
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_TITLE, name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_"));
            getBridge().executeOnMainThread(() -> {
                try { startActivityForResult(call, intent, "documentCreated"); }
                catch (Exception error) {
                    deleteTemp(call);
                    saving.set(false);
                    call.reject("Could not open the save dialog", "SAVE_UNAVAILABLE", error);
                }
            });
        } catch (Exception error) {
            if (temp != null) temp.delete();
            saving.set(false);
            call.reject("Could not prepare the report", "SAVE_PREPARE_FAILED", error);
        }
    }

    private File tempFile(PluginCall call) {
        String name = call.getString("reportTempName", "");
        if (!name.startsWith(PREFIX) || name.contains("/") || name.contains("\\")) return null;
        return new File(getContext().getCacheDir(), name);
    }

    private void deleteTemp(PluginCall call) {
        File file = tempFile(call);
        if (file != null) file.delete();
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) { saving.set(false); return; }
        if (result.getResultCode() != Activity.RESULT_OK) {
            deleteTemp(call);
            saving.set(false);
            JSObject response = new JSObject();
            response.put("status", "cancelled");
            call.resolve(response);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        execute(() -> {
            try {
                File temp = tempFile(call);
                if (uri == null || temp == null || !temp.isFile()) throw new IOException("Report or destination unavailable");
                try (FileInputStream input = new FileInputStream(temp);
                     OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w")) {
                    if (output == null) throw new IOException("Destination unavailable");
                    byte[] buffer = new byte[16384];
                    int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    output.flush();
                }
                JSObject response = new JSObject();
                response.put("status", "saved");
                call.resolve(response);
            } catch (Exception error) {
                // ACTION_CREATE_DOCUMENT creates a new file; remove a partial write.
                if (uri != null) try { DocumentsContract.deleteDocument(getContext().getContentResolver(), uri); } catch (Exception ignored) {}
                call.reject("Could not write the report", "SAVE_FAILED", error);
            } finally {
                deleteTemp(call);
                saving.set(false);
            }
        });
    }
}
