# Kế Hoạch Triển Khai (Implementation Plan)

Dự án: **TV Web Game Hub & Mobile Controller**
Mục tiêu: Xây dựng nền tảng từ MVP (Minimum Viable Product) đến bản hoàn thiện đầy đủ tính năng.

---

## Giai đoạn 1: Khởi Tạo MVP (Core Infrastructure & Connection)
*Mục tiêu: Đảm bảo TV có thể tạo phòng, hiển thị QR/PIN và Mobile có thể kết nối thành công, trở thành Main Controller.*

*   **Bước 1.1: Thiết lập Server (Node.js + Socket.IO)**
    *   Tạo REST/Socket API để cấp phát RoomID.
    *   Quản lý danh sách phòng và các controller (Client) kết nối vào phòng.
    *   **Deliverable:** Server chạy ẩn, có log rõ ràng phòng sinh ra và ai đang kết nối.
*   **Bước 1.2: Client TV (Vite + TS) - Màn hình chờ**
    *   Giao diện đơn giản: Một Card to ở giữa hiển thị biến `RoomPIN` do Server cấp.
    *   Tích hợp thư viện generate QR Code (chỉ tới `IP:PORT/controller?room=PIN`).
*   **Bước 1.3: Client Mobile (React) - Cửa ngõ kết nối & Anti-Webview**
    *   Trang index kiểm tra **User-Agent**. Nếu là Facebook/Zalo In-App Browser -> Cảnh báo chặn lại yêu cầu mở Safari/Chrome.
    *   Màn hình nhập PIN Code đơn giản.
    *   Sau khi nhập đúng PIN, chuyển sang màn hình "Connected! Bạn là Player 1".
*   **Bước 1.4: Tích hợp định tuyến MVP**
    *   Khi Mobile báo Connected, TV lắng nghe và chuyển từ "Màn hình mã PIN" sang "Màn hình trống (Hub Mockup)".

---

## Giai đoạn 2: Điều Hướng Căn Bản & Dynamic State
*Mục tiêu: Xây dựng cơ chế D-Pad trên mobile và phản hồi trên TV Hub. TV có thể load một game rỗng và Mobile hiển thị UI tương ứng.*

*   **Bước 2.1: UI Controller Cơ Bản (Mobile)**
    *   Dựng Component `HubController`: Gồm D-Pad (Trái/Phải/Lên/Xuống), Nút Select (OK), Back.
    *   Tích hợp **Haptic Feedback (Rung)** khi chạm vào các nút.
*   **Bước 2.2: Lắng nghe Signal trên TV Hub**
    *   Tạo danh sách tĩnh 3 game (Game A, Game B, Game C) trên màn hình TV (dạng Carousel thẻ).
    *   Khi Mobile ấn D-Pad, TV Controller lắng nghe sự kiện qua Socket và thay đổi Focus (Focus ring HTML/CSS) giữa các Thẻ Game.
*   **Bước 2.3: State-Aware Logic (Biến hình tay cầm)**
    *   Màn hình TV: Khi D-Pad nhấn "Select" vào Game A, TV emit sự kiện `gameState: { id: 'game_a', state: 'playing' }`.
    *   Mobile: Xây dựng `ControllerRegistry` để bắt sự kiện này, Component Mobile tự động "biến hình" từ `HubController` sang `DummyGamepadA`.

---

## Giai đoạn 3: Tích Hợp Game Engine (PhaserJS Demo)
*Mục tiêu: Gắn một game đơn giản chuẩn chỉ để test độ trễ (Latency).*

*   **Bước 3.1: Định nghĩa Interface GameManager (TV)**
    *   Viết Class chuẩn hóa Game (hàm `mount()`, `unmount()`, `onInput()`).
*   **Bước 3.2: Phát triển Game Flappy Bird Demo**
    *   Tích hợp PhaserJS vào Client TV.
    *   Game chỉ có duy nhất 1 cơ chế: Nhận lệnh "JUMP" để chim nảy lên.
*   **Bước 3.3: Demo Controller (Mobile)**
    *   Tạo Component `FlappyController` với phông nền rực rỡ và 1 nút tròn cực to: "JUMP".
    *   **Thử nghiệm Thực tế:** Kiểm tra độ trễ từ lúc ngón tay chạm nút "JUMP" (rung haptic) đến lúc chim nảy trên màn hình TV. Phải nhỏ hơn 50ms.
*   **Bước 3.4: Cơ chế "Exit Game"**
    *   Bảo đảm có nút tĩnh "Exit to Hub" ở góc màn hình Mobile, nhấn vào sẽ Unmount Canvas PhaserJS trên TV và trả về Hub ban đầu.

---

## Giai đoạn 4: Multi-Controller & Bàn Phím Đảo Chiều (Advanced Features)
*Mục tiêu: Giải quyết bài toán nhiều người chơi và nhập liệu ký tự từ điện thoại.*

*   **Bước 4.1: Quản lý Multi-Player**
    *   Trên Main Controller (P1), bấm "Mời Bạn", hiện mã QR nhỏ ngay trên Mobile 1 để bạn kế bên quét.
    *   Bạn kế bên kết nối, Server ghi nhận P2. TV hiện Toast _"Player 2 Joined"_.
*   **Bước 4.2: Game Demo 2 người chơi (Ví dụ: Đấu võ / Xe tăng)**
    *   Phát triển Demo Game 2 (PhaserJS).
    *   Sự kiện `onInput(playerIndex, action)`: TV phân biệt được P1 di chuyển Tank X xanh, P2 di chuyển Tank Y đỏ.
*   **Bước 4.3: Luồng Keyboard Bàn Phím Động**
    *   Tạo một Form "Leaderboard - Lưu Điểm" bên trong Game Demo 1.
    *   Khi trỏ chuột vào khung Input Tên trên TV, TV phát lệnh `request_keyboard`.
    *   Mobile P1 hiện Text Input to, tự động Focus mở bàn phím điện thoại.
    *   Gõ chữ trên ĐT -> Nhấn "Submit" (Gửi 1 lần) -> TV nhận chuỗi string và điền vào ô Tên.

---

## Giai đoạn 5: Profile Cá Nhân Hóa & Đánh Bóng (Polishing)
*Mục tiêu: Đưa PWA lên mức chất lượng thương mại, giải quyết vấn đề tắt màn hình rớt mạng.*

*   **Bước 5.1: Portable Zero-Setup Profile (Local Storage)**
    *   Khi Mobile Load, kiểm tra `localStorage`. Nếu chưa có -> Tạo random Avatar Màu và ID. Nếu có -> Lấy ra dùng.
    *   Truyền Profile (Màu thẻ, Tên) cùng với lệnh Join Room. Hệ thống TV lấy tên thật hiển thị thay vì Player 1/2.
    *   Chỉnh màu giao diện Controller tiệp màu với Avatar Profile.
*   **Bước 5.2: Tính năng PWA Standalone (Add To Home Screen)**
    *   Tạo `manifest.json` và Service Worker cho Mobile Controller.
    *   Màn hình hướng dẫn nổi bật "Add To Home Screen".
*   **Bước 5.3: Chống Sleep Màn Hình & Auto Reconnect**
    *   Tích hợp NoSleep.js vào Mobile (phát 1 đoạn video tàng hình) để giữ màn hình điện thoại không tự tắt khi mải ngó TV.
    *   Xử lý logic tự động ghép lại phòng cũ dựa trên SessionID nếu Wi-Fi rớt vài ba giây.

---

## Giai đoạn 6: Tính Năng Mở Rộng Đồng Thời (Parallel UI)
*Mục tiêu: Đưa ý tưởng Shop/Nhân vật xử lý trên tay cầm thay vì tivi.*

*   **Bước 6.1: Game RPG Demo (Giao diện Mobile Song Song)**
    *   Tạo Game 3: Có trạng thái `gameState: 'SHOP'`.
    *   Khi vào Shop, TV chỉ hiển thị phong cảnh làng mạc yên bình.
    *   Mobile Controller 1: Hiển thị giao diện Mua Vũ Khí.
    *   Mobile Controller 2: Hiển thị giao diện Mua Áo Giáp.
*   **Bước 6.2: Đồng Bộ Dữ Liệu Ngược**
    *   Khi ĐT1 bấm mua Kiếm (Thành công), ĐT1 tự gửi Event lên TV -> TV Animation vung kiếm.
    *   Xác minh tính độc lập và mượt mà của hệ thống đa Controller.

---
Vòng lặp phát triển: Chúng ta sẽ đi từng chặng. Ở mỗi chặng chặn đứt điểm, test thực tế trước khi đi tiếp. Giai đoạn 1 & 2 là nền móng xương sống cho toàn bộ dự án. 
