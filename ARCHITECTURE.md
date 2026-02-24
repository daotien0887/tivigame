# Kế Hoạch Phát Triển Hệ Thống TV Web Game & Mobile Controller

Mục tiêu: Xây dựng một nền tảng (Hub) hỗ trợ nhiều web game trên Smart TV, điều khiển bằng Mobile Controller, cho phép dễ dàng mở rộng và tích hợp game mới cùng layout tay cầm tùy chỉnh tương ứng.

---

## 1. Kiến Trúc Hệ Thống Tổng Quan (Architecture)

Hệ thống bao gồm 3 thành phần chính:
1. **Server (Node.js & Socket.IO):** Xử lý signaling, quản lý phòng (Room), hub kết nối TV và Mobile, phân phối tin nhắn theo ngữ cảnh game.
2. **Client TV (Vite, TypeScript, Phaser/PixiJS):** Hub hiển thị danh sách game, xử lý game state, render game logic.
3. **Client Mobile (Vite, React, TypeScript):** Ứng dụng PWA Controller. Sẽ tự động thay đổi giao diện/layout nút bấm dựa trên thông tin game đang được chơi do TV truyền qua.

### Luồng Giao Tiếp (Communication Flow)
1. **Khởi tạo:** Mở TV Client -> Kết nối Server -> Nhận `room_code` -> Hiển thị trên màn hình.
2. **Kết nối:** Mở Mobile Client -> Nhập/Quét `room_code` -> Tham gia vào Room.
3. **Mở Game:** Trên TV, chọn game (VD: Game A) -> TV gửi sự kiện `game_started: { gameId: 'flap_bird', controllerLayout: {...} }` xuống Mobile thông qua Server.
4. **Đổi Control Layout:** Mobile nhận được thông điệp, React App render lại UI của Controller tương ứng bằng cách swap sang Component Controller của game đó.
5. **Tương tác:** Nhấn nút trên Mobile -> Phát sự kiện `input: { action: 'JUMP', state: 'pressed' }` -> Gửi đến Server -> Chuyển tiếp ngay đến TV.
6. **Xử lý Logic:** TV nhận input, thực thi hàm trong Game Engine tương ứng.

---

## 2. Cấu Trúc Thư Mục (Directory Structure)

Dự án được cấu trúc dạng Monorepo hoặc chia thư mục rõ ràng:

```text
tivigame/
│
├── server/                     # Backend Node.js
│   ├── src/
│   │   ├── index.js            # Khởi tạo Express & Socket.IO
│   │   ├── roomManager.js      # Logic quản lý phòng (Create, Join, Leave)
│   │   └── eventHandlers.js    # Xử lý các sự kiện relay input giữa TV và Mobile
│   └── package.json
│
├── client-tv/                  # Frontend chạy trên TV (Vanilla TS hoặc React + Phaser)
│   ├── src/
│   │   ├── main.ts             # Điểm entry, quản lý Socket.IO kết nối
│   │   ├── hub/                # Giao diện chính chọn game
│   │   │   ├── HubUI.ts
│   │   │   └── index.css
│   │   ├── core/               # Lõi hệ thống (Tương lai sẽ tách main.ts ra đây)
│   │   └── games/              # Nơi chứa MỖI GAME là một thư mục riêng biệt
│   │       ├── flappy_bird/    # Game 1
│   │       │   ├── assets/     # Assets riêng của game (bird.png, bg.png)
│   │       │   └── index.ts    # Logic Phaser & Cấu hình controller
│   │       └── GameBase.ts     # Lớp cơ sở cho mọi game
│   │       ├── racing_car/     # Game 2
│   │       └── ...
│   └── index.html
│
└── client-mobile/              # Frontend chạy trên Điện thoại (React TS)
    ├── src/
    │   ├── App.tsx             # Quản lý trạng thái (Chưa kết nối / Trong Hub / Đang chơi game)
    │   ├── useSocket.ts        # Custom hook gọi websockets
    │   ├── components/         # Các UI chung (Button, Joystick, Dpad...)
    │   │   ├── Joystick.tsx
    │   │   ├── ActionButton.tsx
    │   │   └── ConnectScreen.tsx
    │   └── controllers/        # Các bộ giao diện Controller ứng với TỪNG GAME
    │       ├── DefaultHubController.tsx # Điều hướng ở màn hình chính
    │       ├── FlappyBirdController.tsx # Chỉ có 1 nút "Nhảy" to đùng
    │       ├── RacingCarController.tsx  # Có Dpad Trái Phải, Nút Ga, Nút Phanh
    │       └── ControllerRegistry.ts    # Map gameId với tương ứng Controller Component
    └── index.html
```

---

## 3. Cách Quản Lý "State" & Hỗ Trợ Nhiều Game (Extensibility)

Để tái sử dụng hệ thống và dễ dàng thêm game mới, chúng ta sử dụng kiến trúc **Game Registry**.

### a) Thêm một game mới trên TV
1. Tạo một thư mục `src/games/tank_battle` trong TV client.
2. Xây dựng logic game. Game phải tuân thủ một Interface chung `IGame`:
    ```typescript
    interface IGame {
        id: string; // VD: 'tank_battle'
        name: string;
        mount: (container: HTMLElement) => void;
        unmount: () => void;
        onInput: (action: string, state: any) => void; 
        getControllerConfig: () => ControllerLayout; // Sẽ gửi cấu hình này qua Mobile
    }
    ```
3. Đăng ký nó vào `GameManager`.

### b) Xử lý trên Mobile (Custom Controller Layout)
Thiết kế `ControllerRegistry.ts` trên Mobile chỉ định Map UI tương ứng. Vd:

```tsx
// src/controllers/ControllerRegistry.ts
import { FlappyController } from './FlappyController';
import { RacingController } from './RacingController';
import { HubController } from './HubController';

export const controllers = {
    'hub': HubController,
    'flappy_bird': FlappyController,
    'racing_car': RacingController,
};
```
Khi TV vào game Flappy Bird, nó sẽ emit message: `current_game_changed: { gameId: 'flappy_bird', gameState: 'playing' }`, lúc đó `<App>` trên mobile React sẽ dựa vào `gameId` và `gameState` để render trực tiếp Component tương ứng.

### c) Hỗ trợ Đa Trạng Thái (Multi-state Controller)
Một game không chỉ có một giao diện tay cầm duy nhất. Hệ thống hỗ trợ thay đổi UI linh hoạt:
- **State: CHARACTER_SELECT**: Controller hiển thị danh sách nhân vật, chỉ số, nút "Pick".
- **State: SHOP**: Controller hiển thị các vật phẩm, giá cả và nút "Buy".
- **State: PLAYING**: Controller hiển thị joystick và các nút hành động.
- **State: GAME_OVER**: Controller hiển thị màn hình kết quả và nút "Replay".

### d) Khả năng Xử lý Song song (Parallel Decentralized Interaction)
Để tối ưu trải nghiệm đa người chơi, hệ thống hỗ trợ các luồng logic độc lập trên mỗi Controller:
- **Mua sắm song song**: TV không cần hiển thị menu Shop chung gây gián đoạn. Mỗi Controller tự hiển thị Shop UI riêng. Player 1 có thể mua vật phẩm A trong khi Player 2 đang duyệt danh sách vật phẩm B cùng lúc.
- **Chọn nhân vật đồng thời**: Mỗi người chơi có thể lướt danh sách và chọn nhân vật trực tiếp trên màn hình điện thoại của mình.
- **Giảm tải cho TV**: TV chỉ tập trung hiển thị thế giới game chính, các thao tác quản lý cá nhân (túi đồ, kỹ năng, shop) được thực hiện riêng tư và song song trên các Controller.

---

## 4. Giải Quyết Bài Toán "Tay Cầm Động" (Lựa chọn: Client Component Mapped)

Để đảm bảo hiệu năng và trải nghiệm người dùng tốt nhất, hệ thống sẽ sử dụng phương án **Client Component Mapped**:

*   **Lý do chọn:** Tay cầm game cần độ phản hồi cực cao, các tương tác rung xúc giác (Haptic Feedback) và giao diện riêng biệt cho từng loại game.
*   **Cách thức hoạt động:** Mobile Client sẽ thực hiện **Hardcode các giao diện controller** (Component-based).
*   **Luồng xử lý:** TV chỉ gửi ID game (VD: `racing_car`), Mobile sẽ dựa vào ID này để render trực tiếp Component layout có sẵn tương ứng.
*   **Ưu điểm:** Giao diện cực đẹp, tối ưu hóa cho từng game, không có độ trễ parse JSON, hỗ trợ tốt các tính năng native như rung (Vibration API) và thay đổi linh hoạt theo ngữ cảnh trong game (State-driven UI).

---

## 5. Timeline Thực Thi Các Bước Tiếp Theo

Nếu bạn đồng ý với kế hoạch này, chúng ta sẽ thực thi theo các bước:

*   **Tập 1:** Hoàn thiện core WebSocket Server & Luồng Connect/Join PIN code.
*   **Tập 2:** Xây dựng Client Mobile (React): Màn hình nhập PIN và một trang Controller mẫu (Dummy).
*   **Tập 3:** Xây dựng Client TV (Vite/TS): Khởi tạo Hub hiển thị QR/PIN code. Kết nối TV nhận tín hiệu thành công.
*   **Tập 4:** Khởi tạo Game Architecture trên TV. Tích hợp PhaserJS, tạo interface chuẩn hóa. Thêm Game Demo 1 (VD: Game Caro hoặc FlappyBird cơ bản).
*   **Tập 5:** Xử lý điều hướng đa luồng: Từ Hub TV -> Game Demo 1 -> Hub TV (Unmount game). Đồng bộ UI Mobile chuyển từ Hub Controller -> Game Controller.
*   **Tập 6:** Tối ưu hóa (Chống sleep màn hình đt, Thêm âm thanh tay cầm, Tối ưu hóa độ trễ).

Bạn có muốn điều chỉnh hay thêm bớt gì trong kế hoạch khung và cấu trúc này không trước khi chúng ta bắt đầu vào **Tập 1**?
