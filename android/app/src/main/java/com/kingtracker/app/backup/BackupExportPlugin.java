package com.kingtracker.app.backup;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "KingBackupExport")
public class BackupExportPlugin extends Plugin {

    @PluginMethod
    public void saveAs(PluginCall call) {
        String filename = call.getString("filename", "king-backup.json");
        String content = call.getString("content");
        String mimeType = call.getString("mimeType", "application/json");
        if (content == null) {
            call.reject("content-required");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);

        startActivityForResult(call, intent, "saveAsResult");
    }

    @ActivityCallback
    private void saveAsResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("cancelled");
            return;
        }
        Intent data = result.getData();
        Uri uri = data != null ? data.getData() : null;
        if (uri == null) {
            call.reject("no-uri");
            return;
        }
        writeContent(call, uri);
    }

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String filename = call.getString("filename", "king-backup.json");
        String content = call.getString("content");
        String mimeType = call.getString("mimeType", "application/json");
        if (content == null) {
            call.reject("content-required");
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/");

                Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                Uri uri = getContext().getContentResolver().insert(collection, values);
                if (uri == null) {
                    call.reject("write-failed");
                    return;
                }
                writeBytes(uri, content);
                call.resolve(resultObject("Downloads", filename));
                return;
            }

            File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!downloads.exists() && !downloads.mkdirs()) {
                call.reject("write-failed");
                return;
            }
            File dest = uniqueFile(downloads, filename);
            try (FileOutputStream fos = new FileOutputStream(dest)) {
                fos.write(content.getBytes(StandardCharsets.UTF_8));
            }
            call.resolve(resultObject(dest.getParent(), dest.getName()));
        } catch (Exception e) {
            call.reject("write-failed", e);
        }
    }

    private void writeContent(PluginCall call, Uri uri) {
        String content = call.getString("content");
        if (content == null) {
            call.reject("content-required");
            return;
        }
        try {
            writeBytes(uri, content);
            call.resolve(resultObject(null, call.getString("filename", "king-backup.json")));
        } catch (Exception e) {
            call.reject("write-failed", e);
        }
    }

    private void writeBytes(Uri uri, String content) throws Exception {
        OutputStream os = getContext().getContentResolver().openOutputStream(uri);
        if (os == null) {
            throw new IllegalStateException("no-output-stream");
        }
        try {
            os.write(content.getBytes(StandardCharsets.UTF_8));
        } finally {
            os.close();
        }
    }

    private File uniqueFile(File dir, String filename) {
        File candidate = new File(dir, filename);
        if (!candidate.exists()) {
            return candidate;
        }
        String base = filename;
        String ext = "";
        int dot = filename.lastIndexOf('.');
        if (dot > 0) {
            base = filename.substring(0, dot);
            ext = filename.substring(dot);
        }
        for (int i = 1; i < 100; i++) {
            File next = new File(dir, base + " (" + i + ")" + ext);
            if (!next.exists()) {
                return next;
            }
        }
        return new File(dir, base + "-" + System.currentTimeMillis() + ext);
    }

    private JSObject resultObject(String folder, String filename) {
        JSObject result = new JSObject();
        result.put("saved", true);
        result.put("filename", filename);
        if (folder != null) {
            result.put("folder", folder);
        }
        return result;
    }
}
