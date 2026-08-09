import UIKit
import WebKit

/// 게임(웹)을 전체화면 WKWebView로 감싸는 껍데기.
/// 내용은 GitHub Pages에 올라간 것을 그대로 쓰므로, 게임을 고치면
/// 앱을 다시 배포하지 않아도 반영된다(안드로이드 TWA와 같은 구조).
final class GameViewController: UIViewController, WKNavigationDelegate {

    private static let gameURL = URL(string: "https://mobydeeep.github.io/Obong-Shunting-Game/")!

    private var webView: WKWebView!
    private let offlineLabel = UILabel()

    override func loadView() {
        let config = WKWebViewConfiguration()
        // 배경음악·효과음이 사용자 조작 없이도 시작될 수 있게 한다
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.scrollView.bounces = false            // 위아래로 끌리는 고무줄 효과 제거
        webView.scrollView.isScrollEnabled = false    // 지도 드래그는 게임이 직접 처리한다
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.04, green: 0.05, blue: 0.09, alpha: 1)
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        setupOfflineLabel()
        webView.load(URLRequest(url: Self.gameURL))
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }

    private func setupOfflineLabel() {
        offlineLabel.text = "인터넷에 연결되어 있지 않습니다.\n연결 후 앱을 다시 실행해 주세요."
        offlineLabel.numberOfLines = 0
        offlineLabel.textAlignment = .center
        offlineLabel.textColor = .white
        offlineLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        offlineLabel.isHidden = true
        offlineLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(offlineLabel)
        NSLayoutConstraint.activate([
            offlineLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            offlineLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            offlineLabel.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            offlineLabel.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
        ])
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        offlineLabel.isHidden = true
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        offlineLabel.isHidden = false
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        offlineLabel.isHidden = false
    }
}
