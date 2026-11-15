import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI
import UserNotifications
import WidgetKit

// Selections travel as base64 JSON of FamilyActivitySelection, the same format
// react-native-device-activity stores, so tokens can be passed back to it.

private func decodeSelection(_ base64: String) -> FamilyActivitySelection? {
  guard let data = Data(base64Encoded: base64) else { return nil }
  return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
}

private func encodeSelection(_ selection: FamilyActivitySelection) -> String {
  guard let data = try? JSONEncoder().encode(selection) else { return "" }
  return data.base64EncodedString()
}

public class LockedAppsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LockedApps")

    /// Splits a selection into one single-token selection per app / category / website.
    Function("split") { (selection: String) -> [[String: String]] in
      guard let sel = decodeSelection(selection) else { return [] }
      var out: [[String: String]] = []
      for token in sel.applicationTokens {
        var one = FamilyActivitySelection()
        one.applicationTokens = [token]
        out.append(["kind": "app", "token": encodeSelection(one)])
      }
      for token in sel.categoryTokens {
        var one = FamilyActivitySelection()
        one.categoryTokens = [token]
        out.append(["kind": "category", "token": encodeSelection(one)])
      }
      for token in sel.webDomainTokens {
        var one = FamilyActivitySelection()
        one.webDomainTokens = [token]
        out.append(["kind": "web", "token": encodeSelection(one)])
      }
      return out
    }

    /// Notification permission: the lock screen's "충전하기" button opens 하고봐 through a notification.
    AsyncFunction("requestNotifications") { (promise: Promise) in
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
        promise.resolve(granted)
      }
    }

    /// Ask the home screen widget to redraw with the latest balance.
    Function("reloadWidgets") {
      WidgetCenter.shared.reloadAllTimelines()
    }

    View(LockedAppLabelView.self) {
      Prop("item") { (view: LockedAppLabelView, item: String) in
        view.setItem(item)
      }
    }
  }
}

/// Icon + name of one picked item, drawn by iOS (the app itself never learns the name).
class LockedAppLabelView: ExpoView {
  private let host = UIHostingController(rootView: AnyView(EmptyView()))

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    isUserInteractionEnabled = false
    host.view.backgroundColor = .clear
    host.view.isUserInteractionEnabled = false
    addSubview(host.view)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    host.view.frame = bounds
  }

  func setItem(_ base64: String) {
    guard #available(iOS 15.2, *), let sel = decodeSelection(base64) else { return }
    if let token = sel.applicationTokens.first {
      host.rootView = AnyView(Label(token).labelStyle(RowLabelStyle()))
    } else if let token = sel.categoryTokens.first {
      host.rootView = AnyView(Label(token).labelStyle(RowLabelStyle()))
    } else if let token = sel.webDomainTokens.first {
      host.rootView = AnyView(Label(token).labelStyle(RowLabelStyle()))
    }
  }
}

private struct RowLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 12) {
      configuration.icon
        .scaleEffect(1.5)
        .frame(width: 36, height: 36)
      configuration.title
        .font(.system(size: 15, weight: .semibold))
        .foregroundColor(Color(red: 0.11, green: 0.11, blue: 0.1))
        .lineLimit(1)
      Spacer(minLength: 0)
    }
  }
}
