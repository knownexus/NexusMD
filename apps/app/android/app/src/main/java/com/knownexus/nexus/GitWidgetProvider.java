package com.knownexus.nexus;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

/** Open pull requests and failed builds. */
public class GitWidgetProvider extends NexusWidgetProvider {
    @Override String kind() { return "git"; }
    @Override String title(Context context) { return "Git"; }

    @Override
    Content content(JSONObject snapshot) throws Exception {
        Content c = new Content();
        JSONObject git = snapshot.optJSONObject("git");
        if (git == null) return c;
        int prs = git.optInt("openPrs", 0);
        int failed = git.optInt("failedBuilds", 0);
        c.count = prs + (prs == 1 ? " open PR" : " open PRs") + (failed > 0 ? " · " + failed + " failed" : "");
        c.empty = "No open pull requests.";
        JSONArray items = array(git, "items");
        for (int i = 0; i < items.length(); i++) c.add(items.getJSONObject(i).optString("title"), null);
        return c;
    }
}
