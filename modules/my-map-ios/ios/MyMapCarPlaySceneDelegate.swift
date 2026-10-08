import CarPlay
import MapKit
import UIKit

// Activated only in builds with Apple's approved CarPlay navigation entitlement.
@objc(MyMapCarPlaySceneDelegate)
public final class MyMapCarPlaySceneDelegate: NSObject, CPTemplateApplicationSceneDelegate {
  private var controller: CPInterfaceController?
  private var window: CPWindow?
  private var map: MKMapView?
  private var template: CPMapTemplate?
  private var session: CPNavigationSession?
  private var destinationKey = ""
  private var observer: NSObjectProtocol?
  private var routeVersion: Double = 0
  private var refreshTimer: Timer?
  public func templateApplicationScene(_ scene: CPTemplateApplicationScene, didConnect interfaceController: CPInterfaceController, to window: CPWindow) {
    self.controller = interfaceController; self.window = window
    MyMapCompanionStore.shared.carConnected = true
    let viewController = UIViewController(), map = MKMapView(frame: window.bounds)
    map.autoresizingMask = [.flexibleWidth,.flexibleHeight]
    viewController.view = map; window.rootViewController = viewController; self.map = map
    map.showsUserLocation = true; map.showsTraffic = true
    let template = CPMapTemplate(); self.template = template
    let center = CPMapButton { [weak self] _ in self?.render() }
    center.image = UIImage(systemName:"location.fill")
    let stop = CPMapButton { _ in MyMapCompanionStore.shared.onStop?() }
    stop.image = UIImage(systemName:"stop.circle")
    template.mapButtons = [center, stop]
    interfaceController.setRootTemplate(template, animated:false, completion:nil)
    observer = NotificationCenter.default.addObserver(forName:.myMapNavigationChanged,object:nil,queue:.main) { [weak self] _ in self?.render() }
    refreshTimer = Timer.scheduledTimer(withTimeInterval:5,repeats:true) { [weak self] _ in self?.render() }
    render()
  }
  public func templateApplicationScene(_ scene: CPTemplateApplicationScene, didDisconnect interfaceController: CPInterfaceController, from window: CPWindow) {
    if let observer { NotificationCenter.default.removeObserver(observer) }; observer = nil
    refreshTimer?.invalidate(); refreshTimer = nil; MyMapCompanionStore.shared.carConnected = false
    session?.finishTrip(); session = nil; map = nil; self.window = nil; controller = nil; template = nil
    destinationKey = ""; routeVersion = 0
  }
  private func render() {
    let store = MyMapCompanionStore.shared, state = store.state
    guard let map, let template else { return }
    let timestamp = state["updatedAt"] as? Double ?? 0
    guard store.carEnabled, state["active"] as? Bool == true, Date().timeIntervalSince1970*1000-timestamp < 60000 else {
      session?.finishTrip(); session = nil; destinationKey = ""; routeVersion = 0
      map.removeOverlays(map.overlays); map.isHidden = true; return
    }
    map.isHidden = false
    if let position = state["position"] as? [String: Any], let lat = position["latitude"] as? Double, let lon = position["longitude"] as? Double,
       CLLocationCoordinate2DIsValid(CLLocationCoordinate2D(latitude:lat,longitude:lon)) {
      let speed = state["speed"] as? Double ?? 0
      map.setRegion(MKCoordinateRegion(center:CLLocationCoordinate2D(latitude:lat,longitude:lon),latitudinalMeters:speed>30 ? 1000:400,longitudinalMeters:speed>30 ? 1000:400),animated:true)
    }
    let raw = (state["coordinates"] as? [[Double]] ?? []).prefix(4000)
    let coordinates = raw.compactMap { pair -> CLLocationCoordinate2D? in
      guard pair.count>=2 else { return nil }
      let coordinate = CLLocationCoordinate2D(latitude:pair[0],longitude:pair[1]); return CLLocationCoordinate2DIsValid(coordinate) ? coordinate:nil
    }
    map.delegate = self
    let version = state["routeVersion"] as? Double ?? 0
    if routeVersion != version {
      routeVersion = version; map.removeOverlays(map.overlays)
      if coordinates.count > 1 { map.addOverlay(MKPolyline(coordinates:coordinates,count:coordinates.count)) }
    }
    let key = state["destination"] as? String ?? "Điểm đến"
    if destinationKey != key || session == nil, let last = coordinates.last {
      session?.finishTrip(); destinationKey = key
      let destination = MKMapItem(placemark:MKPlacemark(coordinate:last)); destination.name = key
      let choice = CPRouteChoice(summaryVariants:[key],additionalInformationVariants:["Tuyến đường từ MyMap"],selectionSummaryVariants:[key])
      let trip = CPTrip(origin:MKMapItem.forCurrentLocation(),destination:destination,routeChoices:[choice])
      session = template.startNavigationSession(for:trip)
    }
    if let guidance = state["guidance"] as? [String: Any], let instruction = guidance["instruction"] as? String {
      let maneuver = CPManeuver(); maneuver.instructionVariants = [String(instruction.prefix(200))]
      let meters = max(0,guidance["distanceMeters"] as? Double ?? 0)
      maneuver.initialTravelEstimates = CPTravelEstimates(distanceRemaining:Measurement(value:meters,unit:UnitLength.meters),timeRemaining:0)
      session?.upcomingManeuvers = [maneuver]
    }
  }
}
extension MyMapCarPlaySceneDelegate: MKMapViewDelegate {
  public func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
    guard let line = overlay as? MKPolyline else { return MKOverlayRenderer(overlay:overlay) }
    let renderer = MKPolylineRenderer(polyline:line); renderer.strokeColor = .systemBlue; renderer.lineWidth = 6; return renderer
  }
}
