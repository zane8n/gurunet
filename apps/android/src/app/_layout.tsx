import { router, Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";

export default function AndroidLayout() {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data.route;
      if (route === "network") router.push("/network");
      else if (route === "settings") router.push("/settings");
      else router.push("/");
    });
    return () => subscription.remove();
  }, []);
  return <><StatusBar style="dark"/><Tabs screenOptions={{ headerStyle:{backgroundColor:"#f7f8f8"},headerShadowVisible:false,tabBarActiveTintColor:"#167d87",tabBarStyle:{height:64,paddingBottom:8} }}>
    <Tabs.Screen name="index" options={{title:"Today",tabBarLabel:"Today"}}/>
    <Tabs.Screen name="progress" options={{title:"Progress",tabBarLabel:"Progress"}}/>
    <Tabs.Screen name="network" options={{title:"Network",tabBarLabel:"Network"}}/>
    <Tabs.Screen name="settings" options={{title:"Settings",tabBarLabel:"Settings"}}/>
    <Tabs.Screen name="respond" options={{href:null,title:"Respond"}}/>
  </Tabs></>;
}
