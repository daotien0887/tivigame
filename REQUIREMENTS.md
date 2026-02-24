# Yêu Cầu Chức Năng (Requirements Document)

Dự án: **TV Web Game Hub & Mobile Controller**

Tài liệu này định nghĩa chi tiết các yêu cầu chức năng, đặc tả luồng người dùng và thiết kế cốt lõi của hệ thống dựa trên những nghiệp vụ cần thiết cho môi trường TV được điều khiển bởi thiết bị di động.

---

## 1. Yêu Cầu Bắt Buộc Khởi Đầu (Gateway / Initiation)
*   **Màn hình Connection Lên Hàng Đầu:** Khi ứng dụng Web (Client TV) được mở lên, luồng đầu tiên và bắt buộc là phải hiển thị màn hình **"Kết nối Tay Cầm (Controller Connection)"** chứa Mã PIN (ví dụ: `1234`) và/hoặc Mã QR.
*   **Yêu cầu Main Controller:** TV Web Game **sẽ không thể điều hướng vào màn hình chính (Hub)** nếu như chưa có ít nhất một Controller kết nối thành công.
*   **Thiết lập Main Controller (P1):** Thiết bị di động đầu tiên kết nối vào hệ thống (thông qua mã PIN do TV cung cấp) sẽ mặc định được cấp quyền trượng là **Main Controller (Người chơi 1 / Master)**.
    *   Chỉ có Main Controller mới có quyền điều hướng UI toàn cục, thoát game, hoặc mời thêm người.
    *   **Chuyển quyền Main Controller:** Main Controller có thể chỉ định một Controller khác (P2, P3...) làm Main Controller mới. Khi đó, quyền điều hướng và quản lý sẽ được chuyển giao.
*   **Kỹ Thuật "Thoát Webview" Bắt Buộc (Anti In-App Browser):** Quét QR qua Zalo, Messenger, hay ứng dụng khác thường mở link bằng Webview nội bộ (In-App Browser). Môi trường này giới hạn API (rung, âm thanh) và thường xuyên xóa dữ liệu `localStorage`.
    *   Hệ thống trên Mobile bắt buộc phải sử dụng **User-Agent Detection**.
    *   Nếu phát hiện là In-App Browser, Controller sẽ **từ chối load giao diện** và hiển thị hướng dẫn nổi bật yêu cầu người dùng: _"Vui lòng nhấn [Mở bằng trình duyệt ngoài / Open in Safari / Chrome]"_ để đảm bảo trải nghiệm tay cầm.
*   **Định Hình Thành PWA (Progressive Web App):** Ứng dụng web chạy trên Mobile Controller phải đạt chuẩn PWA 100%.
    *   Cung cấp tính năng **Add to Home Screen (A2HS)**. Khi cài đặt, Controller lưu thành một icon trên máy, chạy độc lập không lộ thanh địa chỉ (Standalone mode).
    *   Việc chạy dưới dạng PWA Standalone là điều kiện tiên quyết để giữ kết nối ổn định, giữ màn hình không bị tắt, và lưu vững chắc dữ liệu Profile cục bộ (`localStorage` / `IndexedDB`).

---

## 2. Yêu Cầu Điều Khiển Cơ Bản (D-pad & Navigation)
Bất kể khi đang ở Menu chọn game (Hub) hay trong một số tính năng hệ thống, Controller (tay cầm điện thoại) phải cung cấp được khả năng điều khiển tương đương Remote TV.
*   **Navigation D-Pad:** Mobile Controller phải có các nút: **Trái, Phải, Lên, Xuống**.
*   **Action Buttons:**
    *   **Select / OK:** Dùng để chọn game hoặc xác nhận hành động.
    *   **Back:** Dùng để quay lại thao tác trước đó.
    *   **Exit / Home:** Nút đặc quyền (thường nằm trên Main Controller) dùng để Force-Exit một game đang mở và quay về màn hình Hub.
*   **Phản hồi xúc giác (Haptic Feedback):** Mọi tương tác nhấn nút trên Mobile Controller phải đi kèm với rung nhẹ (Vibration) để người dùng có cảm giác như đang cầm tay cầm vật lý thực sự.
*   **Cơ chế truyền tín hiệu:** Việc bấm các nút này trên điện thoại sẽ gửi Message qua WebSocket (Socket.IO) với độ trễ tối thiểu, Client TV sẽ lắng nghe và highlight sự kiện tương ứng trên giao diện (ví dụ Focus vào Game Card thay đổi).

---

## 3. Quản Lý Đa Controller (Multi-Controller Support)
Hệ thống phải hỗ trợ nhiều người chơi cùng lúc trên cùng một màn hình TV.
*   **Add New Controller:** Trên màn hình của **Main Controller**, phải có một tuỳ chọn / nút bấm là **"Add Player / Kết nối thêm Controller"**.
    *   Khi nhấn vào đây, có hai hướng triển khai:
        1.  TV hiển thị lại mã QR/PIN ở góc màn hình để người thứ 2 quét.
        2.  Main Controller hiển thị một Link/Mã QR trên chính điện thoại đó để share cho bạn bè bên cạnh.
*   **Định danh Controller:** Mỗi Controller khi tham gia vào phải được định danh thứ tự (Player 2, Player 3) tương ứng với ID trong WebSockets.
*   **Chế độ Game độc lập:** Khi một game nhiều người chơi được kích hoạt, TV Client sẽ gửi lệnh cấu hình giao diện Tay cầm xuống cho *tất cả* các Controller đang kết nối. Từng Controller sẽ render UI tay cầm phụ thuộc vào thông số truyền từ Server.
*   **Controller biến hình theo trạng thái (State-aware UI):** Controller không chỉ thay đổi theo Game ID mà còn phải thay đổi theo **Trạng thái (State)** của game đó.
    *   **Ví dụ:** Trong cùng một game RPG:
        *   Màn hình chờ: Hiện menu Start/Options.
        *   Màn hình chọn tướng: Hiện danh sách ảnh tướng để người dùng vuốt chọn trên điện thoại.
        *   Màn hình mua đồ: Hiện Inventory và Shop ngay trên Mobile để mỗi người chơi thao tác độc lập. **Tính chất song song:** Việc mua sắm diễn ra trên từng điện thoại cá nhân, không làm gián đoạn màn hình TV và không bắt buộc người chơi khác phải chờ đợi (mỗi người tự mua đồ của mình cùng lúc).
        *   Màn hình chiến đấu: Hiện Joystick và Skill buttons.
*   **Tự ngắt kết nối (Self-Disconnect):** Mỗi Controller có quyền tự ngắt kết nối (thoát phòng) bất cứ lúc nào qua nút "Disconnect" trên giao diện Mobile.
    *   Nếu Main Controller tự ngắt kết nối mà vẫn còn các Controller khác trong phòng, hệ thống sẽ tự động chỉ định một Controller còn lại (theo thứ tự gia nhập) làm Main Controller mới để đảm bảo việc điều khiển không bị gián đoạn.
    *   Nếu tất cả Controller đều ngắt kết nối, TV Client sẽ tự động quay về màn hình "Kết nối Tay Cầm" chờ người chơi mới.

---

## 4. Xử Lý Bàn Phím Động (Dynamic Keyboard Input)
Bởi vì việc gõ chữ trên TV bằng Remote/D-pad rất chậm chạp, chúng ta sử dụng bàn phím ảo của điện thoại để làm input chính.
*   **Hiệu ứng gọi Keyboard (Input Triggering):**
    *   Bất cứ khi nào màn hình TV yêu cầu nhập một đoạn Text (Ví dụ: Nhập Tên Người Chơi, Tìm Kiếm Game, Chat Log, v.v.), Client TV sẽ gửi một sự kiện `request_keyboard` xuống Controller đang điều khiển trỏ chuột đó.
*   **Render Keyboard trên Mobile:**
    *   Ngay khi nhận event, Mobile Client (PWA) sẽ đè một Component Modal / Input Text box mượt mà lên giao diện hiện tại, tự động `focus()` vào Text Input để mở bàn phím mặc định của iOS/Android.
*   **Luồng gửi dữ liệu (Input Submission):**
    *   Show text input trực tiếp trên giao diện Controller để người dùng nhập liệu.
    *   Dữ liệu chỉ được gửi lên TV sau khi người dùng nhấn nút "Submit" hoặc "Enter/Done" trên bàn phím Mobile. Điều này giúp tránh việc đồng bộ liên tục từng ký tự gây tốn tài nguyên và lag giao diện TV.
    *   Controller gửi sự kiện `keyboard_submit` đi kèm với toàn bộ đoạn Text, sau đó đóng bàn phím/input và trở lại layout điều khiển bình thường.

---

## 5. Danh Sách Các Luồng (User Flows Summary)
1.  **Luồng Vào App:** Mở TV -> TV tự động tạo Room & chờ ở màn "Nhập PIN" -> Mở Điện thoại -> Điện thoại tạo Web, nhập PIN -> Điện thoại thành Main Controller -> TV tự chuyển qua Hub chọn Game.
2.  **Luồng Chọn Game:** Main Controller vuốt (Lên/Xuống/Trái/Phải) -> Thẻ Game trên TV Focus chạy theo -> Nhấn nút Select -> TV Loader khởi tạo Game (Mount Game) -> TV Gửi 'State = GameX' tới Controller -> Controller biến hình thành Gamepad (Ví dụ: Tay lái) cho Game X.
3.  **Luồng Nhập Tên:** TV hiện cửa sổ: "Player 1 Nhập Tên" -> Main Controller hiện bàn phím điện thoại -> Gõ 'Tí Tèo' -> Gửi -> TV cập nhật UI tên 'Tí Tèo'.
4.  **Luồng Rủ Bạn Chơi Chung:** Chơi Game Đua Xe (2 người) -> Main Controller nhấn góc màn hình phần 'Mở rộng Option' -> Chọn 'Thêm tay cầm' -> TV (hoặc Mobile 1) hiện QR Pin -> Điện thoại bạn quét -> Điện thoại bạn biến thành Tay Cầm 2.
5.  **Luồng Thoát:** Main Controller nhấn nút 'Exit' hệ thống -> Game X bị Unmount, dừng loop âm thanh animation -> TV quay lại màn Hub, gửi trạng thái 'Hub' -> Component Controller lại trở về form UI Trái/Phải/Select.

---

## 6. Tầm Nhìn & Tính Năng Mở Rộng Cấu Trúc (Future Visions)
*Đây là các ý tưởng nhằm biến hệ thống thành một nền tảng thực sự mạnh mẽ (có thể cân nhắc phát triển sau khi Core hoàn thiện).*

*   **Portable Zero-Setup Profile (Hồ Sơ Cục Bộ "Bỏ Túi"):** Vì Controller là thiết bị điện thoại cá nhân (PWA độc lập), hệ thống nên lưu toàn bộ Profile sơ bộ (Tên người chơi, màu sắc Avatar yêu thích, thông số tinh chỉnh) vào `localStorage` của điện thoại. Nhờ đó, dù bạn chơi ở TV nhà mình, hay quét QR chơi ở TV nhà bạn bè, phòng công ty, hệ thống lập tức nhận diện "Player ABC đã mang theo cờ của họ vào phòng". Điều này tạo ra khái niệm "Tay cầm mang theo" đúng nghĩa.
*   **Motion Controls (Gia tốc kế):** Lợi dụng `DeviceOrientation` API để biến điện thoại thành Vô lăng xoay, Cần câu cá (vung tay), hoặc lắc Xí ngầu thay vì chỉ bấm nút cứng.
*   **Màn Hình Bí Mật (Asymmetric Gameplay):** Phục vụ các Boardgame (Ma Sói, Mèo Nổ, Uno). TV hiện bản đồ chung, Mobile hiện bài trên tay/vai trò bí mật. Không sợ lộ thông tin khi chơi chung phòng.
*   **Chế Độ Khán Giả Tương Tác (Spectator Mode):** Cho phép dư số lượng người tham gia vào phòng chờ (Ví dụ Game 4 người nhưng phòng 10 người). Khán giả có màn hình Controller riêng để gửi icon, ném cà chua/thả tim lên TV hoặc "vote" (bầu chọn quyết định) ảnh hưởng đến người đang chơi.
*   **Âm Thanh Phụ & Second Screen Sound:** Âm thanh của túi đồ, đạn, hoặc hiệu ứng đặc biệt sẽ được phát ra từ **LOA của Điện Thoại** để tạo cảm giác không gian và sống động hơn.
*   **Global Save & Cross-Game Inventory:** Tạo hệ sinh thái khép kín. Cày tiền ở "Game A", sau đó ra HUB vào "Ví/Túi đồ" chung để dùng tiền đó mua Skin đem vào "Game B".
