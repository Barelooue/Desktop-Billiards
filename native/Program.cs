using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Diagnostics;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Threading;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Program {
 [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr FindWindow(string className,string title);
 [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr handle);
 [STAThread] static void Main(string[] args) {
  bool first;
  using(var instance=new Mutex(true,"Local\\DesktopBilliards.App",out first)){
  if(!first){var previous=FindWindow(null,"一个人的台球 · Desktop Billiards");if(previous!=IntPtr.Zero)SetForegroundWindow(previous);return;}
  SetProcessDPIAware(); Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
  try { Application.Run(new TableWindow(args)); }
  catch(Exception ex) { MessageBox.Show("启动失败："+ex.Message,"一个人的台球",MessageBoxButtons.OK,MessageBoxIcon.Error); }
  }
 }
}
internal sealed class TableWindow:Form {
 WebView2 web; bool test,closeReady,closing;
 public TableWindow(string[] args) {
  test=args.Contains("--test"); Text="一个人的台球 · Desktop Billiards"; BackColor=Color.FromArgb(17,27,25);
  Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
  bool windowed=test&&!args.Contains("--fullscreen");
  FormBorderStyle=windowed?FormBorderStyle.Sizable:FormBorderStyle.None;
  if(windowed){ClientSize=new Size(1400,900);StartPosition=FormStartPosition.CenterScreen;}else{Bounds=Screen.FromPoint(Cursor.Position).Bounds;WindowState=FormWindowState.Maximized;}
  Shown+=async (s,e)=>await Initialize();
 }
 async Task Initialize(){
  try {
   web=new WebView2 {Dock=DockStyle.Fill,DefaultBackgroundColor=BackColor}; Controls.Add(web);
   string profile=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"DesktopBilliards",test?"WebView2-Test":"WebView2");
   var options=new CoreWebView2EnvironmentOptions();
   // The release never enables debugging or a listening server.
   if(test) options.AdditionalBrowserArguments="--remote-debugging-port=9339";
   var env=await CoreWebView2Environment.CreateAsync(null,profile,options);await web.EnsureCoreWebView2Async(env);
   var core=web.CoreWebView2;core.Settings.AreDevToolsEnabled=test;core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.IsStatusBarEnabled=false;core.Settings.IsZoomControlEnabled=false;
   core.Settings.IsGeneralAutofillEnabled=false;core.Settings.IsPasswordAutosaveEnabled=false;core.Settings.AreBrowserAcceleratorKeysEnabled=false;
   Deactivate+=(s,e)=>{try{core.MemoryUsageTargetLevel=CoreWebView2MemoryUsageTargetLevel.Low;core.PostWebMessageAsJson("{\"type\":\"pause\"}");}catch{}};
   Activated+=(s,e)=>{try{core.MemoryUsageTargetLevel=CoreWebView2MemoryUsageTargetLevel.Normal;}catch{}};
   core.SetVirtualHostNameToFolderMapping("billiards.local",Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"web"),CoreWebView2HostResourceAccessKind.DenyCors);
   core.NavigationStarting+=(s,e)=>{Uri uri;if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out uri)||uri.Host!="billiards.local")e.Cancel=true;};
   core.NewWindowRequested+=(s,e)=>{
    e.Handled=true;
    if(!e.IsUserInitiated||!IsEventSource(e.Uri))return;
    try{
     Process.Start(new ProcessStartInfo(e.Uri){UseShellExecute=true});
    }catch(Exception){
     MessageBox.Show(this,"无法打开赛事资料，请检查 Windows 默认浏览器设置。",Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);
    }
   };
   core.PermissionRequested+=(s,e)=>e.State=CoreWebView2PermissionState.Deny;
   core.WebMessageReceived+=OnWebMessage;
   string desktop=await Task.Run(()=>DesktopSource.Read());
   await core.AddScriptToExecuteOnDocumentCreatedAsync("window.DESKTOP_SOURCE="+desktop+";window.BILLIARDS_TEST="+(test?"true":"false")+";");
   core.Navigate("https://billiards.local/index.html");
  }catch(Exception ex){MessageBox.Show(this,"无法启动球台。请确认已安装 Microsoft Edge WebView2 Runtime。\n\n"+ex.Message,"一个人的台球",MessageBoxButtons.OK,MessageBoxIcon.Error);Close();}
 }
 static bool IsEventSource(string address){
  Uri uri;
  if(!Uri.TryCreate(address,UriKind.Absolute,out uri)||uri.Scheme!=Uri.UriSchemeHttps||
     !uri.IsDefaultPort||!String.IsNullOrEmpty(uri.UserInfo))return false;
  return uri.Host=="matchroompool.com"||uri.Host=="wpapool.com"||
   uri.Host=="wpbsa.com"||uri.Host=="www.wpbsa.com"||uri.Host=="www.wst.tv"||uri.Host=="worldnineballtour.com";
 }
 async void OnWebMessage(object sender,CoreWebView2WebMessageReceivedEventArgs e){
  if(e.Source!="https://billiards.local/index.html")return;
  try{
   var json=new JavaScriptSerializer{MaxJsonLength=4000000};
   var data=json.Deserialize<Dictionary<string,object>>(e.WebMessageAsJson);
   object type;
   if(!data.TryGetValue("type",out type))return;
   if((string)type=="exit"){Close();return;}
   if((string)type!="calendar"||!data.ContainsKey("source")||!data.ContainsKey("id"))return;
   string source=data["source"] as string,id=data["id"] as string;
   if(String.IsNullOrEmpty(id)||id.Length>64)return;
   string url;
   switch(source){
    case "wnt":url="https://worldnineballtour.com/schedule/";break;
    case "wpa":url="https://wpapool.com/?mec-ical-feed=1";break;
    case "wpaevents":url="https://wpapool.com/events/";break;
    case "heyball":url="https://wpapool.com/wp-json/wp/v2/posts?categories=77&per_page=30&_fields=date,link,title,excerpt";break;
    case "wpbsa":url="https://www.wpbsa.com/events-list/";break;
    default:return;
   }
   string content=await Task.Run(()=>ReadCalendar(url));
   if(!IsDisposed&&web!=null&&web.CoreWebView2!=null)
    web.CoreWebView2.PostWebMessageAsJson(json.Serialize(new {type="calendar",id,content}));
  }catch{}
 }
 static string ReadCalendar(string url){
  try{
   var request=(HttpWebRequest)WebRequest.Create(url);
   request.Timeout=7000;request.ReadWriteTimeout=7000;
   request.AllowAutoRedirect=false;
   request.AutomaticDecompression=DecompressionMethods.GZip|DecompressionMethods.Deflate;
   request.UserAgent="DesktopBilliards/1.0";
   using(var response=request.GetResponse())
   using(var input=new StreamReader(response.GetResponseStream())){
    var output=new System.Text.StringBuilder();
    var chunk=new char[8192];
    int count;
    while((count=input.Read(chunk,0,chunk.Length))>0){
     if(output.Length+count>1500000)return null;
     output.Append(chunk,0,count);
    }
    return output.ToString();
   }
  }catch{return null;}
 }
 protected override async void OnFormClosing(FormClosingEventArgs e){
  if(closeReady||web==null||web.CoreWebView2==null){base.OnFormClosing(e);return;}
  e.Cancel=true;base.OnFormClosing(e);if(closing)return;closing=true;
  try{
   var save=web.CoreWebView2.ExecuteScriptAsync("window.prepareBilliardsClose ? window.prepareBilliardsClose() : true");
   var completed=await Task.WhenAny(save,Task.Delay(5000));
   if(completed!=save)throw new Exception("存档响应超时，请稍后再试。");
   if(await save!="true"){closing=false;return;}
   closeReady=true;BeginInvoke(new Action(Close));
  }catch(Exception ex){closing=false;MessageBox.Show(this,"尚未确认存档完成，窗口已保留。\n"+ex.Message,"一个人的台球",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
 }
 protected override void OnFormClosed(FormClosedEventArgs e){if(web!=null)web.Dispose();base.OnFormClosed(e);}
}
internal static class DesktopSource {
 public static string Read(){
  string wallpaper=null;
  try{
   using(var key=Registry.CurrentUser.OpenSubKey(@"Control Panel\Desktop")){
    var path=key==null?null:key.GetValue("WallPaper") as string;
    if(!String.IsNullOrEmpty(path)&&File.Exists(path))using(var source=Image.FromFile(path)){
     // The background is blurred: 960px is enough and avoids retaining a 4K bitmap.
     int width=Math.Min(960,source.Width),height=Math.Max(1,(int)((double)source.Height/source.Width*width));
     using(var scaled=new Bitmap(width,height))using(var g=Graphics.FromImage(scaled))using(var stream=new MemoryStream()){
      g.DrawImage(source,0,0,width,height);scaled.Save(stream,ImageFormat.Jpeg);wallpaper="data:image/jpeg;base64,"+Convert.ToBase64String(stream.ToArray());
     }
    }
   }
  }catch{}
  return new JavaScriptSerializer{MaxJsonLength=8*1024*1024}.Serialize(new {wallpaper=wallpaper});
 }
}
