import ExpoModulesCore
import FirebaseAuth
import Foundation
import GameKit

public final class MyMapGameCenterModule: Module {
  private var pendingPromise: Promise?

  public func definition() -> ModuleDefinition {
    Name("MyMapGameCenter")

    AsyncFunction("isAvailable") {
      true
    }

    AsyncFunction("signIn") { (promise: Promise) in
      guard self.pendingPromise == nil else {
        promise.reject("ERR_GAME_CENTER_IN_PROGRESS", "Một yêu cầu Game Center khác đang được xử lý.")
        return
      }
      self.pendingPromise = promise
      self.authenticateLocalPlayer()
    }.runOnQueue(.main)
  }

  private func authenticateLocalPlayer() {
    let player = GKLocalPlayer.local
    if player.isAuthenticated {
      signInToFirebase(player: player)
      return
    }

    player.authenticateHandler = { [weak self] viewController, error in
      guard let self else { return }
      DispatchQueue.main.async {
        if let viewController {
          guard let presenter = self.appContext?.utilities?.currentViewController() else {
            self.reject("ERR_GAME_CENTER_UI", "Không thể mở giao diện đăng nhập Game Center.")
            return
          }
          presenter.present(viewController, animated: true)
          return
        }

        if player.isAuthenticated {
          self.signInToFirebase(player: player)
          return
        }

        self.reject(
          "ERR_GAME_CENTER_AUTH",
          error?.localizedDescription ?? "Người chơi chưa đăng nhập Game Center."
        )
      }
    }
  }

  private func signInToFirebase(player: GKLocalPlayer) {
    GameCenterAuthProvider.getCredential { [weak self] credential, error in
      guard let self else { return }
      if let error {
        self.reject("ERR_GAME_CENTER_CREDENTIAL", error.localizedDescription)
        return
      }
      guard let credential else {
        self.reject("ERR_GAME_CENTER_CREDENTIAL", "Firebase không tạo được Game Center credential.")
        return
      }

      Auth.auth().signIn(with: credential) { [weak self] result, error in
        guard let self else { return }
        if let error {
          self.reject("ERR_GAME_CENTER_FIREBASE", error.localizedDescription)
          return
        }
        guard let user = result?.user else {
          self.reject("ERR_GAME_CENTER_FIREBASE", "Firebase không trả về người dùng Game Center.")
          return
        }
        GKLocalPlayer.local.authenticateHandler = nil
        self.pendingPromise?.resolve([
          "uid": user.uid,
          "displayName": user.displayName as Any,
          "playerId": player.gamePlayerID
        ])
        self.pendingPromise = nil
      }
    }
  }

  private func reject(_ code: String, _ message: String) {
    GKLocalPlayer.local.authenticateHandler = nil
    pendingPromise?.reject(code, message)
    pendingPromise = nil
  }
}
