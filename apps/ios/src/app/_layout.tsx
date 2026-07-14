import { router, Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";

export default function IOSLayout(){
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data.route;
      if (route === "network") router.push("/network");
      else if (route === "settings") router.push("/settings");
      else router.push("/");
    });
    return () => subscription.remove();
  }, []);
  return <><StatusBar style="dark"/><Tabs screenOptions={{headerTransparent:true,tabBarActiveTintColor:"#167d87"}}><Tabs.Screen name="index" options={{title:"Today"}}/><Tabs.Screen name="notebook" options={{title:"Notebook"}}/><Tabs.Screen name="network" options={{title:"Network"}}/><Tabs.Screen name="settings" options={{title:"Settings"}}/><Tabs.Screen name="respond" options={{href:null,title:"Response"}}/></Tabs></>;
}
