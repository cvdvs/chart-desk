// ============================================================
// Chart Desk.app — a native window around the local server.
//
// The server itself is the LaunchAgent (com.chartdesk.server,
// 127.0.0.1:4700). This app does not own it: it kickstarts it if
// it is asleep, waits for the port, and shows the UI. Quitting
// the app leaves the server running, so the phone keeps working.
//
// Objective-C rather than Swift because the Command Line Tools
// Swift toolchain on this Mac has a compiler/SDK version mismatch
// and cannot build against the system SDK. Cocoa + WebKit from
// clang has no such problem and needs no runtime shipped along.
// ============================================================
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

static NSString *const kHome     = @"http://127.0.0.1:4700/";
static NSString *const kAgent    = @"com.chartdesk.server";
static NSString *const kFrameKey = @"ChartDeskWindow";

// The window has no titlebar of its own, so the page draws all the way to the
// top edge and the sidebar's own background sits behind the traffic lights —
// no seam. These two paddings are what keeps the "Chart Desk" heading and the
// page content from colliding with them. Injected only here, so the browser
// and the phone are untouched.
static NSString *const kInsetCSS =
    @"(function(){"
    @"  var s=document.createElement('style');"
    @"  s.textContent='.side-head{padding-top:38px}"
    @"                 .main-inner{padding-top:44px}"
    @"                 .menubtn{top:38px}';"
    @"  document.head.appendChild(s);"
    @"})()";

// Every export in the UI — chart PNGs, the .md packs, the jsPDF build — ends in
// an <a download> pointing at a blob: or data: URL. A browser saves those; a
// WKWebView silently does nothing, because the download only ever exists inside
// the page. Both entry points have to be covered: app.js calls a.click(), while
// jsPDF dispatches a synthetic MouseEvent at a *detached* anchor — which no
// document-level listener can ever see. Patching the two prototype methods
// catches both and hands the bytes to the app to write.
static NSString *const kDownloadShim =
    @"(function(){"
    @"  var A=HTMLAnchorElement.prototype, click=A.click, dispatch=A.dispatchEvent;"
    @"  function grab(a){"
    @"    var name=a.getAttribute('download'), href=a.href||'';"
    @"    if(!name||!/^(blob:|data:)/.test(href)) return false;"
    @"    fetch(href).then(function(r){return r.blob()}).then(function(b){"
    @"      var fr=new FileReader();"
    @"      fr.onload=function(){"
    @"        window.webkit.messageHandlers.save.postMessage("
    @"          {name:name,data:String(fr.result).split(',')[1]||''});"
    @"      };"
    @"      fr.readAsDataURL(b);"
    @"    });"
    @"    return true;"
    @"  }"
    @"  A.click=function(){"
    @"    if(grab(this)) return;"
    @"    return click.apply(this,arguments);"
    @"  };"
    @"  A.dispatchEvent=function(e){"
    @"    if(e&&e.type==='click'&&grab(this)) return true;"
    @"    return dispatch.apply(this,arguments);"
    @"  };"
    @"})()";

// The page keeps its own light/dark setting in localStorage (cd-theme) rather
// than following the system, so the window has to be told which one is showing
// — otherwise its background flashes the wrong colour on load and resize.
static NSString *const kThemeBridge =
    @"(function(){"
    @"  var send=function(){"
    @"    window.webkit.messageHandlers.theme.postMessage("
    @"      document.documentElement.dataset.theme||'light');"
    @"  };"
    @"  new MutationObserver(send).observe(document.documentElement,"
    @"    {attributes:true,attributeFilter:['data-theme']});"
    @"  send();"
    @"})()";

// ------------------------------------------------------------
@interface AppDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate,
                                   WKUIDelegate, WKDownloadDelegate,
                                   WKScriptMessageHandler>
@property (strong) NSWindow  *window;
@property (strong) WKWebView *web;
@property (strong) NSTextField *status;
@property (assign) NSInteger tries;
@end

@implementation AppDelegate

// --- server -------------------------------------------------

- (BOOL)serverIsUp {
    // A HEAD against the health endpoint, 400ms budget. Cheap enough
    // to poll while the LaunchAgent boots node.
    NSURL *u = [NSURL URLWithString:kHome];
    NSMutableURLRequest *r = [NSMutableURLRequest requestWithURL:u
        cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:0.4];
    r.HTTPMethod = @"HEAD";
    __block BOOL ok = NO;
    dispatch_semaphore_t sem = dispatch_semaphore_create(0);
    [[NSURLSession.sharedSession dataTaskWithRequest:r
        completionHandler:^(NSData *d, NSURLResponse *resp, NSError *e) {
            ok = (resp != nil && e == nil);
            dispatch_semaphore_signal(sem);
        }] resume];
    dispatch_semaphore_wait(sem,
        dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.2 * NSEC_PER_SEC)));
    return ok;
}

- (void)kickstartServer {
    NSTask *t = [NSTask new];
    t.launchPath = @"/bin/launchctl";
    t.arguments  = @[@"kickstart", [NSString stringWithFormat:@"gui/%d/%@",
                                    getuid(), kAgent]];
    t.standardOutput = NSFileHandle.fileHandleWithNullDevice;
    t.standardError  = NSFileHandle.fileHandleWithNullDevice;
    @try { [t launch]; } @catch (NSException *e) { /* agent not installed */ }
}

- (void)waitForServerThenLoad {
    if ([self serverIsUp]) {
        self.status.hidden = YES;
        self.web.hidden = NO;
        [self.web loadRequest:[NSURLRequest requestWithURL:
            [NSURL URLWithString:kHome]]];
        return;
    }
    self.tries++;
    if (self.tries == 1) [self kickstartServer];
    if (self.tries > 40) {                       // ~20s, then say so plainly
        self.status.stringValue = @"Chart Desk’s engine isn’t responding on "
            @"port 4700.\n\nIn Terminal:\n"
            @"launchctl kickstart -k gui/$UID/com.chartdesk.server\n\n"
            @"Then press ⌘R here.";
        return;
    }
    self.status.stringValue = @"Starting the chart engine…";
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{ [self waitForServerThenLoad]; });
}

// --- window -------------------------------------------------

- (void)applicationDidFinishLaunching:(NSNotification *)n {
    NSRect frame = NSMakeRect(0, 0, 1280, 860);
    self.window = [[NSWindow alloc] initWithContentRect:frame
        styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                  NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable |
                  NSWindowStyleMaskFullSizeContentView
        backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"Chart Desk";
    self.window.titlebarAppearsTransparent = YES;
    self.window.titleVisibility = NSWindowTitleHidden;
    self.window.minSize = NSMakeSize(720, 560);
    [self.window center];
    [self.window setFrameAutosaveName:kFrameKey];

    WKWebViewConfiguration *cfg = [WKWebViewConfiguration new];
    cfg.websiteDataStore = [WKWebsiteDataStore defaultDataStore];   // keeps localStorage
    [cfg.preferences setValue:@YES forKey:@"developerExtrasEnabled"];
    WKUserContentController *ucc = cfg.userContentController;
    [ucc addScriptMessageHandler:self name:@"theme"];
    [ucc addScriptMessageHandler:self name:@"save"];
    // The shim has to be in place before app.js can hand out an anchor, so it
    // goes in at document start; the other two need the DOM and go in at end.
    [ucc addUserScript:[[WKUserScript alloc] initWithSource:kDownloadShim
        injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];
    for (NSString *src in @[kInsetCSS, kThemeBridge])
        [ucc addUserScript:[[WKUserScript alloc] initWithSource:src
            injectionTime:WKUserScriptInjectionTimeAtDocumentEnd forMainFrameOnly:YES]];

    self.web = [[WKWebView alloc] initWithFrame:frame configuration:cfg];
    self.web.navigationDelegate = self;
    self.web.UIDelegate = self;
    self.web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.web.allowsBackForwardNavigationGestures = YES;
    self.web.hidden = YES;

    self.status = [NSTextField labelWithString:@"Starting the chart engine…"];
    self.status.alignment = NSTextAlignmentCenter;
    self.status.font = [NSFont systemFontOfSize:13];
    self.status.textColor = NSColor.secondaryLabelColor;
    self.status.autoresizingMask = NSViewWidthSizable | NSViewMinYMargin |
                                   NSViewMaxYMargin;

    NSView *content = self.window.contentView;
    content.wantsLayer = YES;
    [content addSubview:self.status];
    [content addSubview:self.web];
    // Size against the real content bounds, not the frame the window was asked
    // for — the saved window frame and the titlebar both change it.
    self.web.frame = content.bounds;
    [self applyTheme:@"light"];   // self.web now exists + content.wantsLayer=YES, so every surface themes
    self.status.frame = NSMakeRect(40, NSMidY(content.bounds) - 60,
                                   NSWidth(content.bounds) - 80, 120);

    [self buildMenu];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
    [self waitForServerThenLoad];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)a { return YES; }

- (BOOL)applicationShouldHandleReopen:(NSApplication *)a hasVisibleWindows:(BOOL)v {
    if (!v) [self.window makeKeyAndOrderFront:nil];
    return YES;
}

// --- theme --------------------------------------------------

- (void)applyTheme:(NSString *)theme {
    BOOL dark = [theme isEqualToString:@"dark"];
    // Drives the traffic-light rendering (light lights on a dark page look wrong)
    // and the colour behind the page before it paints. app.css --panel.
    self.window.appearance = [NSAppearance appearanceNamed:
        dark ? NSAppearanceNameDarkAqua : NSAppearanceNameAqua];
    NSColor *bg = dark ? [NSColor colorWithSRGBRed:0x20/255.0 green:0x1f/255.0 blue:0x26/255.0 alpha:1]
                       : NSColor.whiteColor;
    self.window.backgroundColor = bg;
    self.window.contentView.layer.backgroundColor = bg.CGColor;
    // Give the web view its OWN opaque theme backing. A default WKWebView is
    // opaque and paints its own compositing backing; with nothing set it reveals
    // WebKit's default (black) layer during any reflow/recomposite gap. Pinning
    // that backing to the theme colour means a gap can only ever show the panel
    // colour — the window/contentView colours below are fully occluded by the
    // web view once it is visible, so they cannot be the backstop on their own.
    if (self.web) {
        self.web.underPageBackgroundColor = bg;      // public API, macOS 12+ (our floor)
        self.web.layer.backgroundColor = bg.CGColor; // WKWebView is layer-backed
    }
}

- (void)userContentController:(WKUserContentController *)ucc
      didReceiveScriptMessage:(WKScriptMessage *)msg {
    if ([msg.name isEqualToString:@"theme"] && [msg.body isKindOfClass:NSString.class]) {
        [self applyTheme:(NSString *)msg.body];
    } else if ([msg.name isEqualToString:@"save"] &&
               [msg.body isKindOfClass:NSDictionary.class]) {
        NSDictionary *d = msg.body;
        [self saveExport:d[@"name"] base64:d[@"data"]];
    }
}

// --- exports ------------------------------------------------

- (NSURL *)uniqueDownloadsURLFor:(NSString *)filename {
    NSURL *dir = [NSFileManager.defaultManager URLsForDirectory:NSDownloadsDirectory
                                                      inDomains:NSUserDomainMask].firstObject;
    NSURL *dest = [dir URLByAppendingPathComponent:filename];
    NSString *base = dest.URLByDeletingPathExtension.lastPathComponent;
    NSString *ext  = dest.pathExtension;
    for (int i = 2; [NSFileManager.defaultManager fileExistsAtPath:dest.path]; i++) {
        dest = [dir URLByAppendingPathComponent:
            ext.length ? [NSString stringWithFormat:@"%@ %d.%@", base, i, ext]
                       : [NSString stringWithFormat:@"%@ %d", base, i]];
    }
    return dest;
}

- (void)toast:(NSString *)text {
    NSString *js = [NSString stringWithFormat:
        @"(function(){var t=document.getElementById('toast');if(!t)return;"
        @"t.textContent=%@;t.classList.add('show');"
        @"clearTimeout(window.__cdToast);"
        @"window.__cdToast=setTimeout(function(){t.classList.remove('show')},2200);})()",
        [self jsString:text]];
    [self.web evaluateJavaScript:js completionHandler:nil];
}

- (NSString *)jsString:(NSString *)s {
    NSData *j = [NSJSONSerialization dataWithJSONObject:@[s ?: @""] options:0 error:nil];
    NSString *arr = [[NSString alloc] initWithData:j encoding:NSUTF8StringEncoding];
    return [arr substringWithRange:NSMakeRange(1, arr.length - 2)];   // strip [ ]
}

- (void)saveExport:(NSString *)filename base64:(NSString *)b64 {
    if (![filename isKindOfClass:NSString.class] || ![b64 isKindOfClass:NSString.class]) return;
    NSData *bytes = [[NSData alloc] initWithBase64EncodedString:b64
        options:NSDataBase64DecodingIgnoreUnknownCharacters];
    if (!bytes.length) { [self toast:@"Export was empty — nothing saved"]; return; }

    NSURL *dest = [self uniqueDownloadsURLFor:filename.lastPathComponent];
    NSError *err = nil;
    if (![bytes writeToURL:dest options:NSDataWritingAtomic error:&err]) {
        [self toast:[NSString stringWithFormat:@"Could not save: %@",
                     err.localizedDescription]];
        return;
    }
    [self toast:[NSString stringWithFormat:@"Saved to Downloads — %@",
                 dest.lastPathComponent]];
    [NSDistributedNotificationCenter.defaultCenter
        postNotificationName:@"com.apple.DownloadFileFinished" object:dest.path];
    [[NSSound soundNamed:@"Morse"] play];
}

// --- webview ------------------------------------------------

- (void)webView:(WKWebView *)w didFinishNavigation:(WKNavigation *)nav {
    self.web.hidden = NO;
    self.status.hidden = YES;
}

- (void)webView:(WKWebView *)w didFailProvisionalNavigation:(WKNavigation *)nav
      withError:(NSError *)error {
    self.web.hidden = YES;
    self.status.hidden = NO;
    self.tries = 0;
    [self waitForServerThenLoad];
}

// target="_blank" and window.open (the /llms.txt link, the export "Open"
// previews): open in the real browser instead of replacing the SPA in this
// window — which has no visible Back button and trapped the user with no way
// back. The main window stays on the app; the link opens in her default browser
// (localhost is reachable there too).
- (WKWebView *)webView:(WKWebView *)w
    createWebViewWithConfiguration:(WKWebViewConfiguration *)cfg
    forNavigationAction:(WKNavigationAction *)action
    windowFeatures:(WKWindowFeatures *)f {
    if (action.request.URL) [NSWorkspace.sharedWorkspace openURL:action.request.URL];
    return nil;
}

- (void)webView:(WKWebView *)w
    decidePolicyForNavigationAction:(WKNavigationAction *)action
    decisionHandler:(void (^)(WKNavigationActionPolicy))done {
    NSURL *u = action.request.URL;
    // Anything that is not our own server opens in the real browser —
    // the app window is for Chart Desk, not for browsing.
    if (u && ![u.host isEqualToString:@"127.0.0.1"] &&
              ![u.host isEqualToString:@"localhost"] &&
              ![u.scheme isEqualToString:@"blob"] &&
              ![u.scheme isEqualToString:@"data"] &&
              ![u.scheme isEqualToString:@"about"]) {
        [NSWorkspace.sharedWorkspace openURL:u];
        done(WKNavigationActionPolicyCancel);
        return;
    }
    done(WKNavigationActionPolicyAllow);
}

// Exports (.md, .pdf, .png) arrive as downloads; send them to ~/Downloads.
- (void)webView:(WKWebView *)w
    decidePolicyForNavigationResponse:(WKNavigationResponse *)response
    decisionHandler:(void (^)(WKNavigationResponsePolicy))done {
    done(response.canShowMIMEType ? WKNavigationResponsePolicyAllow
                                  : WKNavigationResponsePolicyDownload);
}

- (void)webView:(WKWebView *)w navigationAction:(WKNavigationAction *)a
    didBecomeDownload:(WKDownload *)d { d.delegate = self; }
- (void)webView:(WKWebView *)w navigationResponse:(WKNavigationResponse *)r
    didBecomeDownload:(WKDownload *)d { d.delegate = self; }

// Server-sent downloads (a plain link to an endpoint) take this path; the
// in-page blob/data exports take the shim above. Both land in ~/Downloads.
- (void)download:(WKDownload *)download
    decideDestinationUsingResponse:(NSURLResponse *)response
    suggestedFilename:(NSString *)filename
    completionHandler:(void (^)(NSURL *))done {
    done([self uniqueDownloadsURLFor:filename]);
}

- (void)downloadDidFinish:(WKDownload *)download {
    NSString *path = download.progress.fileURL.path;
    [self toast:[NSString stringWithFormat:@"Saved to Downloads — %@",
                 path.lastPathComponent]];
    [NSDistributedNotificationCenter.defaultCenter
        postNotificationName:@"com.apple.DownloadFileFinished" object:path];
    [[NSSound soundNamed:@"Morse"] play];
}

// --- actions ------------------------------------------------

- (void)reload:(id)sender {
    if (self.web.hidden) { self.tries = 0; [self waitForServerThenLoad]; }
    else [self.web reloadFromOrigin];
}
- (void)goBack:(id)s    { [self.web goBack]; }
- (void)goForward:(id)s { [self.web goForward]; }
- (void)goHome:(id)s {
    [self.web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:kHome]]];
}
- (void)actualSize:(id)s  { self.web.pageZoom = 1.0; }
- (void)zoomIn:(id)s      { self.web.pageZoom = MIN(self.web.pageZoom + 0.1, 2.5); }
- (void)zoomOut:(id)s     { self.web.pageZoom = MAX(self.web.pageZoom - 0.1, 0.5); }
- (void)printPage:(id)s {
    NSPrintInfo *info = NSPrintInfo.sharedPrintInfo;
    info.orientation = NSPaperOrientationPortrait;
    [[self.web printOperationWithPrintInfo:info]
        runOperationModalForWindow:self.window delegate:nil
                    didRunSelector:NULL contextInfo:NULL];
}
- (void)openInBrowser:(id)s {
    [NSWorkspace.sharedWorkspace openURL:(self.web.URL ?:
        [NSURL URLWithString:kHome])];
}

// --- menu ---------------------------------------------------

static NSMenuItem *Item(NSMenu *m, NSString *title, SEL sel, NSString *key,
                        NSEventModifierFlags mods) {
    NSMenuItem *i = [m addItemWithTitle:title action:sel keyEquivalent:key];
    if (mods) i.keyEquivalentModifierMask = mods;
    return i;
}

- (void)buildMenu {
    NSMenu *bar = [NSMenu new];
    NSEventModifierFlags cmd = NSEventModifierFlagCommand;
    NSEventModifierFlags cmdShift = cmd | NSEventModifierFlagShift;

    NSMenuItem *appItem = [bar addItemWithTitle:@"" action:NULL keyEquivalent:@""];
    NSMenu *app = [NSMenu new];
    [app addItemWithTitle:@"About Chart Desk"
                   action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
    [app addItem:NSMenuItem.separatorItem];
    Item(app, @"Hide Chart Desk", @selector(hide:), @"h", cmd);
    Item(app, @"Hide Others", @selector(hideOtherApplications:), @"h", cmd | NSEventModifierFlagOption);
    [app addItemWithTitle:@"Show All" action:@selector(unhideAllApplications:) keyEquivalent:@""];
    [app addItem:NSMenuItem.separatorItem];
    Item(app, @"Quit Chart Desk", @selector(terminate:), @"q", cmd);
    appItem.submenu = app;

    NSMenuItem *fileItem = [bar addItemWithTitle:@"File" action:NULL keyEquivalent:@""];
    NSMenu *file = [[NSMenu alloc] initWithTitle:@"File"];
    Item(file, @"Print…", @selector(printPage:), @"p", cmd);
    [file addItem:NSMenuItem.separatorItem];
    Item(file, @"Open in Browser", @selector(openInBrowser:), @"b", cmdShift);
    [file addItem:NSMenuItem.separatorItem];
    Item(file, @"Close Window", @selector(performClose:), @"w", cmd);
    fileItem.submenu = file;

    // Without a real Edit menu, ⌘C/⌘V do nothing in the app's text fields.
    NSMenuItem *editItem = [bar addItemWithTitle:@"Edit" action:NULL keyEquivalent:@""];
    NSMenu *edit = [[NSMenu alloc] initWithTitle:@"Edit"];
    Item(edit, @"Undo", @selector(undo:), @"z", cmd);
    Item(edit, @"Redo", @selector(redo:), @"z", cmdShift);
    [edit addItem:NSMenuItem.separatorItem];
    Item(edit, @"Cut", @selector(cut:), @"x", cmd);
    Item(edit, @"Copy", @selector(copy:), @"c", cmd);
    Item(edit, @"Paste", @selector(paste:), @"v", cmd);
    Item(edit, @"Select All", @selector(selectAll:), @"a", cmd);
    editItem.submenu = edit;

    NSMenuItem *viewItem = [bar addItemWithTitle:@"View" action:NULL keyEquivalent:@""];
    NSMenu *view = [[NSMenu alloc] initWithTitle:@"View"];
    Item(view, @"Reload", @selector(reload:), @"r", cmd);
    Item(view, @"Dashboard", @selector(goHome:), @"0", cmdShift);
    [view addItem:NSMenuItem.separatorItem];
    Item(view, @"Back", @selector(goBack:), @"[", cmd);
    Item(view, @"Forward", @selector(goForward:), @"]", cmd);
    [view addItem:NSMenuItem.separatorItem];
    Item(view, @"Actual Size", @selector(actualSize:), @"0", cmd);
    Item(view, @"Zoom In", @selector(zoomIn:), @"+", cmd);
    Item(view, @"Zoom Out", @selector(zoomOut:), @"-", cmd);
    [view addItem:NSMenuItem.separatorItem];
    Item(view, @"Enter Full Screen", @selector(toggleFullScreen:), @"f", cmd | NSEventModifierFlagControl);
    viewItem.submenu = view;

    NSMenuItem *winItem = [bar addItemWithTitle:@"Window" action:NULL keyEquivalent:@""];
    NSMenu *win = [[NSMenu alloc] initWithTitle:@"Window"];
    Item(win, @"Minimize", @selector(performMiniaturize:), @"m", cmd);
    [win addItemWithTitle:@"Zoom" action:@selector(performZoom:) keyEquivalent:@""];
    winItem.submenu = win;

    NSApp.mainMenu = bar;
    NSApp.windowsMenu = win;
}

@end

// ------------------------------------------------------------
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *app = NSApplication.sharedApplication;
        app.activationPolicy = NSApplicationActivationPolicyRegular;
        AppDelegate *d = [AppDelegate new];
        app.delegate = d;
        [app run];
    }
    return 0;
}
