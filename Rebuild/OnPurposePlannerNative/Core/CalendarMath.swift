import Foundation

let monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
]

let weekdayInitials = ["S", "M", "T", "W", "T", "F", "S"]
let weekdayShort = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

struct PlannerCalendarCell: Hashable, Identifiable {
    var id: String {
        "\(year)-\(month)-\(dayNumber)-\(inMonth)"
    }
    let date: Date
    let dayNumber: Int
    let inMonth: Bool
    let month: Int
    let year: Int
}

struct PlannerCalendarMonth: Hashable {
    let year: Int
    let month: Int
    let monthName: String
    let weeks: [[PlannerCalendarCell]]
}

func generateCalendar(year: Int, month: Int) -> PlannerCalendarMonth {
    let firstOfMonth = DateComponents(calendar: .current, year: year, month: month, day: 1).date ?? Date()
    let firstWeekdayOffset = Calendar.current.component(.weekday, from: firstOfMonth) - 1
    let gridStart = Calendar.current.date(byAdding: .day, value: -firstWeekdayOffset, to: firstOfMonth) ?? firstOfMonth

    var weeks: [[PlannerCalendarCell]] = []
    for row in 0..<6 {
        var week: [PlannerCalendarCell] = []
        for col in 0..<7 {
            let offset = row * 7 + col
            let cellDate = Calendar.current.date(byAdding: .day, value: offset, to: gridStart) ?? gridStart
            let cellMonth = Calendar.current.component(.month, from: cellDate)
            let cellYear = Calendar.current.component(.year, from: cellDate)
            let cellDay = Calendar.current.component(.day, from: cellDate)

            week.append(
                PlannerCalendarCell(
                    date: cellDate,
                    dayNumber: cellDay,
                    inMonth: cellMonth == month,
                    month: cellMonth,
                    year: cellYear
                )
            )
        }
        weeks.append(week)
    }

    return PlannerCalendarMonth(
        year: year,
        month: month,
        monthName: monthNames[max(0, min(monthNames.count - 1, month - 1))],
        weeks: weeks
    )
}

func shiftMonth(year: Int, month: Int, offset: Int) -> (year: Int, month: Int, monthName: String) {
    let baseDate = DateComponents(calendar: .current, year: year, month: month, day: 1).date ?? Date()
    let shifted = Calendar.current.date(byAdding: .month, value: offset, to: baseDate) ?? baseDate
    let shiftedMonth = Calendar.current.component(.month, from: shifted)
    let shiftedYear = Calendar.current.component(.year, from: shifted)
    return (
        year: shiftedYear,
        month: shiftedMonth,
        monthName: monthNames[max(0, min(monthNames.count - 1, shiftedMonth - 1))]
    )
}

func formatWeekRange(_ week: [PlannerCalendarCell]) -> String {
    guard let start = week.first, let end = week.last else {
        return "Week"
    }

    let startName = monthNames[max(0, min(monthNames.count - 1, start.month - 1))]
    let endName = monthNames[max(0, min(monthNames.count - 1, end.month - 1))]

    if start.month == end.month && start.year == end.year {
        return "\(startName) \(start.dayNumber)-\(end.dayNumber)"
    }
    return "\(startName) \(start.dayNumber)-\(endName) \(end.dayNumber)"
}

func weekTabLabel(_ week: [PlannerCalendarCell]) -> String {
    guard let start = week.first, let end = week.last else {
        return "Week"
    }
    if start.month == end.month {
        return "\(start.dayNumber)-\(end.dayNumber)"
    }
    return "\(start.dayNumber)/\(start.month)-\(end.dayNumber)/\(end.month)"
}

func currentWeekIndex(year: Int, month: Int) -> Int {
    let today = Date()
    let todayYear = Calendar.current.component(.year, from: today)
    let todayMonth = Calendar.current.component(.month, from: today)
    let todayDay = Calendar.current.component(.day, from: today)

    guard todayYear == year, todayMonth == month else {
        return 0
    }

    let calendar = generateCalendar(year: year, month: month)
    guard let index = calendar.weeks.firstIndex(where: { week in
        week.contains(where: { cell in
            cell.inMonth && cell.dayNumber == todayDay && cell.month == month
        })
    }) else {
        return 0
    }
    return index
}
