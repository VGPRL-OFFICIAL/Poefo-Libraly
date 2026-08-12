package com.vgprl.poefo.lib;

import android.animation.*;
import android.app.*;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.*;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.content.res.*;
import android.graphics.*;
import android.graphics.drawable.*;
import android.media.*;
import android.net.*;
import android.os.*;
import android.text.*;
import android.text.style.*;
import android.util.*;
import android.view.*;
import android.view.View.*;
import android.view.animation.*;
import android.webkit.*;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.*;
import android.widget.LinearLayout;
import androidx.annotation.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.DialogFragment;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentManager;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout.OnRefreshListener;
import java.io.*;
import java.text.*;
import java.util.*;
import java.util.regex.*;
import org.json.*;

public class MainActivity extends AppCompatActivity {
	
	private SwipeRefreshLayout swiperefreshlayout1;
	private LinearLayout linear1;
	private LinearLayout linear2;
	private WebView webview1;
	
	private AlertDialog.Builder dialog;
	private SharedPreferences pagina;
	
	@Override
	protected void onCreate(Bundle _savedInstanceState) {
		super.onCreate(_savedInstanceState);
		setContentView(R.layout.main);
		initialize(_savedInstanceState);
		initializeLogic();
	}
	
	private void initialize(Bundle _savedInstanceState) {
		swiperefreshlayout1 = findViewById(R.id.swiperefreshlayout1);
		linear1 = findViewById(R.id.linear1);
		linear2 = findViewById(R.id.linear2);
		webview1 = findViewById(R.id.webview1);
		webview1.getSettings().setJavaScriptEnabled(true);
		webview1.getSettings().setSupportZoom(true);
		dialog = new AlertDialog.Builder(this);
		pagina = getSharedPreferences("save", Activity.MODE_PRIVATE);
		
		swiperefreshlayout1.setOnRefreshListener(new SwipeRefreshLayout.OnRefreshListener() {
			@Override
			public void onRefresh() {
				webview1.loadUrl(webview1.getUrl());
			}
		});
		
		webview1.setWebViewClient(new WebViewClient() {
			@Override
			public void onPageStarted(WebView _param1, String _param2, Bitmap _param3) {
				final String _url = _param2;
				
				super.onPageStarted(_param1, _param2, _param3);
			}
			
			@Override
			public void onPageFinished(WebView _param1, String _param2) {
				final String _url = _param2;
				pagina.edit().putString("pagina", _url).commit();
				android.webkit.CookieManager.getInstance().flush();
				
				swiperefreshlayout1.setRefreshing(false);
				super.onPageFinished(_param1, _param2);
			}
		});
	}
	
	private void initializeLogic() {
		// Configurações modernas de armazenamento
		webview1.getSettings().setDomStorageEnabled(true);
		webview1.getSettings().setDatabaseEnabled(true);
		webview1.getSettings().setJavaScriptEnabled(true);
		
		// Gerenciador de Cookies (O que realmente mantém o login)
		android.webkit.CookieManager cookieManager = android.webkit.CookieManager.getInstance();
		cookieManager.setAcceptCookie(true);
		
		if (android.os.Build.VERSION.SDK_INT >= 21) {
			    cookieManager.setAcceptThirdPartyCookies(webview1, true);
		}
		
		// Forçar gravação imediata
		if (android.os.Build.VERSION.SDK_INT >= 21) {
			    cookieManager.flush();
		} else {
			    android.webkit.CookieSyncManager.createInstance(this);
			    android.webkit.CookieSyncManager.getInstance().startSync();
		}
		
		webview1.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
		webview1.getSettings().setAllowFileAccess(true);
		webview1.getSettings().setAllowContentAccess(true);
		// Esta linha abaixo é o segredo para o Firebase Auth
		webview1.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
		
		if (pagina.getString("pagina", "").equals("")) {
			webview1.loadUrl("captu-libraly.web.app");
		} else {
			if (pagina.getString("pagina", "").equals("captu-libraly.web.app/html/login.html")) {
				webview1.loadUrl("captu-libraly.web.app");
			} else {
				webview1.loadUrl(pagina.getString("pagina", ""));
			}
		}
		webview1.getViewTreeObserver().addOnScrollChangedListener(new android.view.ViewTreeObserver.OnScrollChangedListener() {
			    @Override
			    public void onScrollChanged() {
				        if (webview1.getScrollY() == 0) {
					            // Se o scroll estiver no topo, permite o gesto de atualizar
					
					
					            swiperefreshlayout1.setEnabled(true);
					        } else {
					            // Se não estiver no topo, bloqueia o gesto para não bugar ao subir a página
					swiperefreshlayout1.setEnabled(false);
					        }
				    }
		});
		
	}
	
	@Override
	public void onBackPressed() {
		if (webview1.canGoBack()) {
			webview1.goBack();
		} else {
			dialog.setIcon(R.drawable.poefo_icon);
			dialog.setTitle("Poefo Library");
			dialog.setMessage("Deseja fechar o app Poefo Library?");
			dialog.setPositiveButton("Sim", new DialogInterface.OnClickListener() {
				@Override
				public void onClick(DialogInterface _dialog, int _which) {
					pagina.edit().putString("pagina", "").commit();
					finish();
				}
			});
			dialog.setNegativeButton("Não", new DialogInterface.OnClickListener() {
				@Override
				public void onClick(DialogInterface _dialog, int _which) {
					
				}
			});
			dialog.create().show();
		}
	}
	
	@Override
	public void onStop() {
		super.onStop();
		android.webkit.CookieManager.getInstance().flush();
		
	}
	
	@Override
	public void onPause() {
		super.onPause();
		android.webkit.CookieManager.getInstance().flush();
		
	}
	
	@Deprecated
	public void showMessage(String _s) {
		Toast.makeText(getApplicationContext(), _s, Toast.LENGTH_SHORT).show();
	}
	
	@Deprecated
	public int getLocationX(View _v) {
		int _location[] = new int[2];
		_v.getLocationInWindow(_location);
		return _location[0];
	}
	
	@Deprecated
	public int getLocationY(View _v) {
		int _location[] = new int[2];
		_v.getLocationInWindow(_location);
		return _location[1];
	}
	
	@Deprecated
	public int getRandom(int _min, int _max) {
		Random random = new Random();
		return random.nextInt(_max - _min + 1) + _min;
	}
	
	@Deprecated
	public ArrayList<Double> getCheckedItemPositionsToArray(ListView _list) {
		ArrayList<Double> _result = new ArrayList<Double>();
		SparseBooleanArray _arr = _list.getCheckedItemPositions();
		for (int _iIdx = 0; _iIdx < _arr.size(); _iIdx++) {
			if (_arr.valueAt(_iIdx))
			_result.add((double)_arr.keyAt(_iIdx));
		}
		return _result;
	}
	
	@Deprecated
	public float getDip(int _input) {
		return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, _input, getResources().getDisplayMetrics());
	}
	
	@Deprecated
	public int getDisplayWidthPixels() {
		return getResources().getDisplayMetrics().widthPixels;
	}
	
	@Deprecated
	public int getDisplayHeightPixels() {
		return getResources().getDisplayMetrics().heightPixels;
	}
}