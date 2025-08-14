import io
import base64
import matplotlib.pyplot as plt

def chart_html(
    x,
    y,
    title="My Chart",
    xlabel="X",
    ylabel="Y",
    plot_type="line",  # "line" or "bar"
    width=6,
    height=4,
):
    fig, ax = plt.subplots(figsize=(width, height))

    if plot_type == "bar":
        ax.bar(x, y)
    else:
        ax.plot(x, y)

    ax.set_title(title)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.grid(True, linestyle="--", alpha=0.4)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)

    img_b64 = base64.b64encode(buf.read()).decode("utf-8")
    buf.close()

    html = f"""<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>{title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; }}
      .wrap {{ max-width: 900px; margin: 0 auto; }}
      h1 {{ font-size: 1.5rem; margin: 0 0 12px; }}
      .meta {{ color: #555; margin-bottom: 16px; }}
      img {{ max-width: 100%; height: auto; display: block; }}
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>{title}</h1>
      <div class="meta">{xlabel} vs {ylabel}</div>
      <img alt="chart" src="data:image/png;base64,{img_b64}"/>
    </div>
  </body>
</html>"""
    return html

# --- Example usage ---
x_demo = [1, 2, 3, 4, 5]
y_demo = [3, 8, 2, 10, 7]
html = chart_html(
    x=x_demo,
    y=y_demo,
    title="Sales over Weeks",
    xlabel="Week",
    ylabel="Sales",
    plot_type="line",
    width=6,
    height=4,
)

# Save the HTML so you can open it in a browser
with open("chart_example.html", "w", encoding="utf-8") as f:
    f.write(html)
