import SwiftUI
import WidgetKit

// Data written by the app (src/platform/widget.ts) into the shared App Group.
private let store = UserDefaults(suiteName: "group.com.hagobwa.app")
private let chargeURL = URL(string: "hagobwa://workout")!

private let ink = Color(red: 28 / 255, green: 28 / 255, blue: 26 / 255)
private let red = Color(red: 224 / 255, green: 69 / 255, blue: 74 / 255)
private let paper = Color(red: 247 / 255, green: 247 / 255, blue: 243 / 255)
private let track = Color(red: 58 / 255, green: 58 / 255, blue: 54 / 255)
private let mute = Color(red: 168 / 255, green: 168 / 255, blue: 162 / 255)
private let muteDark = Color(red: 112 / 255, green: 112 / 255, blue: 106 / 255)

struct HagobwaEntry: TimelineEntry {
  let date: Date
  let balanceMin: Int
  let capMin: Int
  let pushups: Int
  let squats: Int
  let streak: Int
  let reps10: Int
}

private func readEntry() -> HagobwaEntry {
  let d = store?.dictionary(forKey: "hagobwaWidget") ?? [:]
  func n(_ k: String) -> Int { (d[k] as? NSNumber)?.intValue ?? 0 }
  // Today's counts reset at midnight even if the app hasn't been opened since.
  let dayStart = Date(timeIntervalSince1970: Double(n("dayStart")) / 1000)
  let today = Calendar.current.isDateInToday(dayStart)
  return HagobwaEntry(
    date: Date(),
    balanceMin: n("balanceSec") / 60,
    capMin: max(1, n("capSec") / 60),
    pushups: today ? n("pushups") : 0,
    squats: today ? n("squats") : 0,
    streak: n("streak"),
    reps10: max(1, n("reps10"))
  )
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> HagobwaEntry {
    HagobwaEntry(date: Date(), balanceMin: 21, capMin: 120, pushups: 12, squats: 4, streak: 3, reps10: 10)
  }

  func getSnapshot(in context: Context, completion: @escaping (HagobwaEntry) -> Void) {
    completion(context.isPreview ? placeholder(in: context) : readEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<HagobwaEntry>) -> Void) {
    let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
    completion(Timeline(entries: [readEntry()], policy: .after(next)))
  }
}

private struct Logo: View {
  var color: Color
  var size: CGFloat = 15
  var body: some View {
    (Text("하고봐").foregroundColor(color) + Text(".").foregroundColor(red))
      .font(.system(size: size, weight: .black))
      .tracking(-0.4)
  }
}

/// B-5: just the minutes, red when empty.
private struct SmallView: View {
  let e: HagobwaEntry
  var body: some View {
    let empty = e.balanceMin <= 0
    VStack(alignment: .leading, spacing: 0) {
      (Text("하고봐").foregroundColor(empty ? .white : ink) + Text(".").foregroundColor(empty ? .white : red))
        .font(.system(size: 13, weight: .black))
      Spacer(minLength: 0)
      HStack(alignment: .firstTextBaseline, spacing: 1) {
        Text("\(e.balanceMin)").font(.system(size: 56, weight: .heavy)).tracking(-2)
        Text("분").font(.system(size: 17, weight: .bold))
      }
      .foregroundColor(empty ? .white : ink)
      .minimumScaleFactor(0.6)
      .lineLimit(1)
      Text(empty ? "탭해서 충전 →" : "남았어요 · 충전 +")
        .font(.system(size: 12, weight: .bold))
        .foregroundColor(empty ? .white.opacity(0.9) : muteDark)
        .padding(.top, 2)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .containerBackground(for: .widget) { empty ? red : paper }
  }
}

/// B-3: dark card with the balance ring, today's reps and a charge button.
private struct MediumView: View {
  let e: HagobwaEntry
  var body: some View {
    let ratio = min(1, Double(e.balanceMin) / Double(e.capMin))
    HStack(spacing: 16) {
      ZStack {
        Circle().stroke(track, lineWidth: 9)
        Circle()
          .trim(from: 0, to: ratio)
          .stroke(red, style: StrokeStyle(lineWidth: 9, lineCap: .round))
          .rotationEffect(.degrees(-90))
        VStack(spacing: 0) {
          Text("남은 시간").font(.system(size: 10, weight: .semibold)).foregroundColor(mute)
          HStack(alignment: .firstTextBaseline, spacing: 1) {
            Text("\(e.balanceMin)").font(.system(size: 30, weight: .heavy)).tracking(-1)
            Text("분").font(.system(size: 12, weight: .bold))
          }
          .foregroundColor(.white)
          .minimumScaleFactor(0.6)
          .lineLimit(1)
        }
      }
      .frame(width: 104, height: 104)

      VStack(alignment: .leading, spacing: 0) {
        HStack {
          Logo(color: .white)
          Spacer()
          if e.streak > 0 {
            Text("\(e.streak)일 연속").font(.system(size: 11, weight: .semibold)).foregroundColor(mute)
          }
        }
        Spacer(minLength: 4)
        HStack(spacing: 14) {
          stat("푸시업", e.pushups)
          stat("스쿼트", e.squats)
        }
        Spacer(minLength: 4)
        Text(e.balanceMin <= 0 ? "푸시업 \(e.reps10)개면 10분" : "충전하기")
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(.white)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
          .background(RoundedRectangle(cornerRadius: 11).fill(red))
      }
    }
    .containerBackground(for: .widget) { ink }
  }

  private func stat(_ label: String, _ value: Int) -> some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(label).font(.system(size: 11, weight: .semibold)).foregroundColor(mute)
      Text("\(value)회").font(.system(size: 18, weight: .heavy)).foregroundColor(.white)
    }
  }
}

struct HagobwaWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: HagobwaEntry
  var body: some View {
    Group {
      if family == .systemSmall {
        SmallView(e: entry)
      } else {
        MediumView(e: entry)
      }
    }
    .widgetURL(chargeURL)
  }
}

struct HagobwaWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "HagobwaWidget", provider: Provider()) { entry in
      HagobwaWidgetView(entry: entry)
    }
    .configurationDisplayName("하고봐")
    .description("남은 시간을 보고, 누르면 바로 운동하러 가요.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct HagobwaWidgetBundle: WidgetBundle {
  var body: some Widget {
    HagobwaWidget()
  }
}
